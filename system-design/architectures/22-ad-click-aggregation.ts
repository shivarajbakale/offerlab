/**
 * 22. Ad Click Aggregation
 * Level: Staff
 * Group: Architectures
 *
 * Problem: Every click on an ad is money: advertisers are billed per click, per minute, per ad.
 *   Clicks arrive by the thousand every second. The totals must be right: a click counted twice
 *   overcharges an advertiser, a click lost undercharges, and both end up in a dispute.
 *
 * Approach: Keep every click, count each one once, and check the count afterwards
 *   1. Add 1 to the ad's counter for every click. 2. Append every click to a durable log and add
 *   them up per ad per minute in stream consumers; commit the read position after writing the
 *   sums. 3. Write the sums and the read position in one transaction. 4. Close each minute only
 *   after late clicks have had time to arrive, and recount every day from the raw log.
 *
 * Cost: 4,000 clicks a second. Counting in place, a 1 s database stall makes ad SDKs resend
 *   clicks the database then records anyway: ~700 clicks counted twice (overbilled) with no error
 *   anywhere. Through a log, the same stall costs the click endpoint nothing and the database
 *   sees ~40 batch writes a second instead of 4,000. An aggregator dying after writing sums but
 *   before committing its offset replays them: ~6 batches (~600 clicks) counted twice. Sums and
 *   offset in one transaction: the crash cuts off nothing that was written. Holding windows open
 *   2 s for late clicks keeps ~70 batches' windows waiting (rate x wait).
 *
 * Pattern: event log + stream aggregation, idempotent consumer (offsets stored with results),
 *   deduplication by click id, windowing with allowed lateness, batch reconciliation
 * Key insight: Exactly-once counting is not a property of the queue; it comes from making the
 *   write of the result and the record of what it includes a single atomic step (made conditional
 *   on the old offset, so a paused "zombie" aggregator cannot commit too), and from giving every
 *   click an id so a repeat can be recognised.
 * Tradeoffs: Counts arrive minutes late, not instantly; deduplication needs memory per click id
 *   for as long as repeats can arrive; windows held open for late clicks delay final numbers; the
 *   daily recount doubles storage and compute.
 * Staff notes: Bill from the reconciled batch numbers, show the stream numbers on dashboards.
 *   Agree up front how late is too late (a click arriving after the window closed goes to a
 *   correction, not the original invoice). Watch the gap between stream and batch counts; a
 *   growing gap is a bug.
 * Interview signals: "design ad click aggregation", "count clicks for billing", "exactly once",
 *   "late data", "Kafka + Flink", "lambda / kappa architecture".
 * Real world: Kafka transactions and Flink's checkpoints with transactional sinks implement the
 *   "results and read position commit together" idea; the lambda architecture pairs a fast
 *   stream count with a slower batch recount of the same raw events.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: 4,000 clicks a second (every request is a write). The ad
// SDK in the app waits 500 ms for the click to be recorded and, if it hears nothing, sends it
// again (2 attempts in all), as many tracking clients do.
const clicks = () =>
  clients({ to: "lb", qps: knob("qps", 4000, [10, 100_000]), mix: { read: 0, write: 1 }, users: 20_000, timeoutMs: 500, retry: "immediate", attempts: 2 });
const front = (calls: string[]) => ({
  lb: loadBalancer({ to: "api" }),
  // Each API server can hold 2,400 clicks in progress (an event loop, not a thread per click).
  api: server({ label: "Click API", replicas: 4, cores: 4, threads: 400, queue: 2000, serviceMs: { read: 1, write: 1 }, calls }),
});
// The counts table: one row per ad per minute. An UPDATE that adds to a row costs 0.5 ms.
const counts = () => database({ label: "Counts", cores: 4, readMs: 1, writeMs: 0.5, queue: 20_000 });

// @why Stage 1: the click API runs "UPDATE counts SET clicks = clicks + 1 WHERE ad = ? AND
// @why minute = ?" for every click, then redirects the user to the advertiser.
export const inPlace = design("1. Add 1 per click", {
  users: clicks(),
  ...front(["db"]),
  db: counts(),
});

// Clicks go to a durable log (Kafka); consumers hand batches of ~100 clicks to the aggregators,
// which add them up per ad per minute (5 ms) and write the sums.
const log = (to: string) => queue({ label: "Click log (Kafka)", consumers: 40, workMs: 1, to, fanout: 0.01 });
const aggregators = (calls: string[]) => server({ label: "Aggregator", replicas: 2, cores: 4, serviceMs: { read: 5, write: 5 }, calls });

// @why Stage 2: the API appends the click to the log and answers. An aggregator writes a batch's
// @why sums, then commits its read position (offset) to the log. Offsets are committed once a
// @why second (Kafka's default auto-commit is every 5 s), so a batch waits ~0.5 s on average
// @why before it counts as done.
export const commitAfter = design("2. Count in the stream, commit after", {
  users: clicks(),
  ...front(["log"]),
  log: log("agg"),
  agg: aggregators(["db", "offsets"]),
  db: counts(),
  offsets: external({ label: "Offset commit", latencyMs: 500 }),
});

// @why Stage 3: the aggregator writes the sums and the offset they cover in one transaction on
// @why the counts database. On restart it reads its offset from there, not from the log.
export const oneTransaction = design("3. Sums and offset in one transaction", {
  users: clicks(),
  ...front(["log"]),
  log: log("agg"),
  agg: aggregators(["db"]),
  db: counts(),
});

// @why Stage 4: a minute's totals are final only after late clicks have had time to arrive (the
// @why allowed lateness; 2 s here, minutes in real life): each batch schedules a "close" job for
// @why its windows that runs that much later and marks them final. A second reader of the log
// @why copies raw clicks to cheap storage for the daily recount (the simulator draws that reader
// @why as its own queue).
export const lateAndRecount = design("4. Wait for late clicks, recount daily", {
  users: clicks(),
  ...front(["log", "archive"]),
  log: log("agg"),
  agg: aggregators(["db", "close"]),
  db: counts(),
  close: queue({ label: "Close the minute", consumers: 4, workMs: 1, to: "db", delayMs: knob("latenessMs", 2000, [0, 30_000]) }),
  archive: queue({ label: "Raw click archive", consumers: 4, workMs: 20, to: "lake", fanout: 0.001 }),
  lake: external({ label: "Object storage", latencyMs: 50 }),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
type Run = ReturnType<typeof run>;
type Frame = Run["frames"][number];
const total = (r: Run, get: (f: Frame) => number) => r.frames.reduce((n, f) => n + get(f), 0);
// The counts database is 4 times slower for 1 s from 5 s (a checkpoint, a failover, a noisy neighbour).
const stall = [{ at: 5000, kind: "slow" as const, target: "db", factor: 4, durationMs: 1000 }];
const crashAgg = [{ at: 6000, kind: "kill" as const, target: "agg-1" }];
/** Batches an aggregator was in the middle of when its machine died; the log hands them out again. */
const cutOff = (r: Run) => r.frames.find((f) => f.t >= 6000)!.stations.agg.failed;

test("add 1 per click: 4,000 clicks a second, the database half busy", () => {
  const r = run(inPlace, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db > 0.45 && s.util.db < 0.55, `db ${s.util.db}`);
  assert.ok(s.p99 < 50, `p99 ${s.p99}`);
  // Every click is recorded once: database commits match clicks (to within the ones in flight).
  const extra = total(r, (f) => f.stations.db.done) - total(r, (f) => f.clients.sent);
  assert.ok(Math.abs(extra) < 150, `commits - clicks ${extra}`);
});

test("broken: add 1 per click — a 1 s database stall, ~700 clicks counted twice and no error anywhere", () => {
  const r = run(inPlace, { ...S, faults: stall });
  assert.equal(summary(r, 0).errorRate, 0);
  assert.ok(summary(r, 5, 7).p99 > 500, `p99 ${summary(r, 5, 7).p99}`);
  // Clicks the database recorded after the SDK had given up and sent them again.
  const late = total(r, (f) => f.clients.wasted);
  const retried = total(r, (f) => f.clients.retries);
  assert.ok(late > 550 && late < 900, `recorded after the SDK gave up: ${late}`);
  assert.ok(retried >= late, `retried ${retried}`);
  // Both copies were committed: the database holds ~700 more clicks than users made.
  const extra = total(r, (f) => f.stations.db.done) - total(r, (f) => f.clients.sent);
  assert.ok(extra > 500 && extra < 900, `commits - clicks ${extra}`);
});

test("count in the stream: the same stall, and the click endpoint does not notice", () => {
  const r = run(commitAfter, { ...S, faults: stall });
  const s = summary(r, 0);
  assert.equal(s.errorRate, 0);
  assert.equal(s.retries, 0);
  assert.equal(s.wasted, 0);
  assert.ok(summary(r, 5, 7).p99 < 50, `p99 ${summary(r, 5, 7).p99}`);
  // 4,000 clicks a second become ~40 batches and ~40 database writes a second.
  assert.ok(s.calls.db > 30 && s.calls.db < 50, `db writes ${s.calls.db}`);
  assert.ok(s.util.db < 0.05, `db ${s.util.db}`);
});

test("broken: commit after writing — an aggregator dies and ~6 batches are counted twice", () => {
  const r = run(commitAfter, { ...S, faults: crashAgg });
  const cut = cutOff(r);
  // Nearly every cut-off batch had written its sums and was waiting for the offset commit.
  assert.ok(cut >= 5 && cut <= 8, `cut off ${cut}`);
  // ~40 batches a second of ~100 clicks each, so ~6 batches is ~600 clicks.
  assert.ok(summary(r, 3).calls.log > 30 && summary(r, 3).calls.log < 50, `batches ${summary(r, 3).calls.log}`);
  const redelivered = total(r, (f) => f.stations.log.failed);
  assert.ok(redelivered >= cut, `redelivered ${redelivered}`);
  assert.equal(summary(r, 0).errorRate, 0);
});

test("sums and offset in one transaction: the same crash cuts off no written batch", () => {
  const r = run(oneTransaction, { ...S, faults: crashAgg });
  // A batch is in flight only for the ~6 ms before its commit; after it there is nothing left to do.
  assert.ok(cutOff(r) <= 2, `cut off ${cutOff(r)}`);
  assert.equal(summary(r, 0).errorRate, 0);
  assert.ok(summary(r, 3).threads.agg < 0.01, `aggregator workers ${summary(r, 3).threads.agg}`);
});

test("wait for late clicks: ~70 batches' windows waiting to close, the database under 2% busy", () => {
  const r = run(lateAndRecount, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  // Little's law: ~36 batches a second x 2 s of allowed lateness.
  assert.ok(s.calls.log > 30 && s.calls.log < 45, `batches ${s.calls.log} a second`);
  // Averaged over the run (one frame's snapshot swings between ~55 and ~85).
  const fr = r.frames.filter((f) => f.t >= 3000);
  const waiting = fr.reduce((n, f) => n + (f.stations.close.scheduled ?? 0), 0) / fr.length;
  assert.ok(waiting > 62 && waiting < 80, `waiting ${waiting}`);
  assert.ok(s.util.db < 0.02, `db ${s.util.db}`);
  // The archive reader writes ~4 files of 1,000 clicks a second to object storage.
  assert.ok(s.calls.lake > 2.5 && s.calls.lake < 7, `files ${s.calls.lake}`);
  assert.ok(s.costPerHour < 1.8, `cost ${s.costPerHour}`);
});
