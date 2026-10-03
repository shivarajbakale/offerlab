/**
 * 24. Job Scheduler
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Other services ask us to run a job later: "send this reminder at 9:00", "retry this
 *   payout in 10 minutes", "run this report every hour". Every job must run, on time, even when
 *   machines die, and preferably once.
 *
 * Approach: Durable delayed jobs, a pool of workers, idempotent effects, spread-out start times
 *   1. Store each job and put a delayed message on a queue; one worker machine runs them.
 *   2. A pool of workers behind a load balancer: a dead worker's jobs are redelivered and run
 *   again elsewhere, so some run twice, and the job's effect must be idempotent. 3. Hourly jobs
 *   all come due at the top of the hour: spread their start times (jitter) so the workers see a
 *   steady stream instead of a wall.
 *
 * Cost: 500 jobs a second with a 5 s delay keep ~2,500 jobs scheduled (rate x delay). One worker
 *   machine dying for 2 s stops every job for 2 s, cuts off the ~185 jobs it was running (their
 *   partner calls already sent, so they will be sent again), and leaves jobs up to ~3 s late
 *   (the outage plus the catch-up line) while it catches up. With 4 workers, losing one cuts off ~50 jobs and the rest run on time.
 *   At the top of the hour, 1,000 jobs due at once keep the consumers fully busy most of the
 *   time and the last start over 1 s late; spread over the minute, none is more than ~10 ms late.
 *
 * Pattern: durable delayed queue, at-least-once execution with idempotent jobs, jitter
 * Key insight: A scheduler can promise "at least once" or "at most once", never "exactly once":
 *   a worker that dies after the effect but before recording it leaves no way to know. So keep
 *   the at-least-once promise and make running a job twice harmless.
 * Tradeoffs: Redelivery after a crash waits for a visibility timeout (jobs run late); idempotency
 *   needs a key the effect honours; jitter makes "at 9:00" mean "between 9:00 and 9:01".
 * Staff notes: Store the schedule in a database (the source of truth) and treat the queue as a
 *   dispatch mechanism. Alert on lateness (now - due time), not queue length. Use a lease with a
 *   fencing token so a slow worker that lost its job cannot overwrite our own records (primitive
 *   023); a partner API will not check that token, so the call itself still needs an idempotency key.
 * Interview signals: "design a distributed cron", "delayed jobs", "exactly once", "what if the
 *   worker dies", "millions of jobs at midnight".
 * Real world: Amazon SQS offers per-message delays up to 15 minutes and a visibility timeout
 *   after which an unacknowledged message is delivered again; Sidekiq, Celery and Temporal are
 *   common job runners; cron jobs pinned to minute 0 are a well-known source of load spikes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Stages 1 and 2 get the same traffic: 1,000 requests a second from other services. Half
// schedule a job ("run this in 5 s", standing in for minutes or hours), half ask a job's status.
const callers = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 20_000]), mix: { read: 0.5, write: 0.5 } });
const api = () => ({
  lb: loadBalancer({ to: "api" }),
  api: server({ label: "Scheduler API", replicas: 2, cores: 4, serviceMs: { read: 1, write: 1 }, calls: { read: ["db"], write: ["db", "due"] } }),
  db: database({ label: "Jobs table", cores: 4, readMs: 1, writeMs: 2 }),
});
// Each job costs a worker 5 ms of CPU, then calls a partner's API (~400 ms: send the reminder,
// start the payout), then marks the job done in the jobs table.
const workers = (replicas: number) => ({
  wlb: loadBalancer({ to: "worker" }),
  worker: server({ label: "Worker", replicas, cores: 4, threads: 400, serviceMs: { read: 5, write: 5 }, calls: { write: ["partner", "db"] } }),
  partner: external({ label: "Partner API", latencyMs: 400 }),
});
// The delayed queue: a job becomes visible to consumers 5 s after it is queued. A consumer
// hands the job to a worker and waits for it to finish.
const due = (consumers: number) => queue({ label: "Delayed jobs", consumers: knob("consumers", consumers, [1, 2000]), workMs: 1, delayMs: knob("delayMs", 5000, [0, 60_000]), to: "wlb" });

// @why Stage 1: the API stores the job (the source of truth) and puts a delayed message on the
// @why queue. One worker machine runs every job.
export const oneWorker = design("1. Delayed queue, one worker", {
  callers: callers(),
  ...api(),
  due: due(400),
  ...workers(1),
});

// @why Stage 2: four worker machines behind a load balancer that checks their health every second.
export const workerPool = design("2. A pool of workers", {
  callers: callers(),
  ...api(),
  due: due(400),
  ...workers(4),
});

// @why Stage 3: hourly jobs. From here the requests are the scheduler's own clock: at the top of
// @why the hour it reads every job due now and queues them all. The simulator squeezes an hour
// @why into about a second: once a second (at random) 1,000 jobs come due at the same moment.
const hourly = (name: string, ticksPerSecond: number) =>
  design(name, {
    clock: clients({ to: "tick", qps: knob("ticks", ticksPerSecond, [1, 1000]), mix: { read: 0, write: 1 }, users: 1, timeoutMs: 5000 }),
    tick: server({ label: "Scheduler", cores: 4, serviceMs: { read: 2, write: 2 }, calls: ["db", "due"] }),
    db: database({ label: "Jobs table", cores: 4, readMs: 1, writeMs: 2 }),
    due: queue({ label: "Due jobs", consumers: 600, workMs: 1, to: "wlb", fanout: 1000 / ticksPerSecond }),
    ...workers(4),
  });
export const topOfHour = hourly("3. Every hourly job at :00", 1);
// @why Each job is given a random start within its minute (jitter): the same 1,000 jobs a second
// @why now come due 10 at a time, 100 times a second.
export const jittered = hourly("3. Start times spread out", 100);

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
type Run = ReturnType<typeof run>;
const framesOf = (r: Run, from: number, to: number) => r.frames.filter((f) => f.t > from * 1000 && f.t <= to * 1000);
/** Jobs a worker was in the middle of when its machine died: they fail and go back on the queue. */
const cutOff = (r: Run, at: number) => r.frames.find((f) => f.t >= at * 1000)!.stations.worker.failed;
/** The longest any due job waited for a consumer (its lateness), in ms. */
const maxLateness = (r: Run, from: number, to: number) => Math.max(...framesOf(r, from, to).map((f) => f.stations.due.oldestMs ?? 0));
/** Share of the time every consumer was busy. */
const saturated = (r: Run, from: number, to: number) => {
  const fs = framesOf(r, from, to);
  return fs.filter((f) => f.stations.due.util > 0.99).length / fs.length;
};
const killAt6 = (target: string, back?: number) => [
  { at: 6000, kind: "kill" as const, target },
  ...(back ? [{ at: back, kind: "restart" as const, target }] : []),
];

test("delayed queue: 500 jobs a second, ~2,500 waiting for their time", () => {
  const s = summary(run(oneWorker, S), 6);
  assert.equal(s.errorRate, 0);
  // Little's law: jobs scheduled = 500 a second x 5 s.
  assert.ok(s.scheduled.due > 2200 && s.scheduled.due < 2750, `scheduled ${s.scheduled.due}`);
  assert.ok(s.util.worker > 0.55 && s.util.worker < 0.7, `worker ${s.util.worker}`);
  assert.ok(s.oldestMs.due < 20, `late by ${s.oldestMs.due}`);
});

test("broken: the one worker dies for 2 s — nothing runs, and the ~185 jobs it was running start over", () => {
  const r = run(oneWorker, { ...S, faults: killAt6("worker", 8000) });
  const cut = cutOff(r, 6);
  assert.ok(cut > 150 && cut < 230, `cut off ${cut}`);
  // Their partner calls were already sent: the partner keeps working on them after the crash.
  assert.ok(framesOf(r, 6, 6.1)[0].stations.partner.threads > 0.1, "partner still serving the cut-off calls");
  const down = summary(r, 6.2, 8);
  assert.ok(framesOf(r, 6.2, 8).every((f) => (f.stations.due.processed ?? 0) === 0), "no job finishes while it is down");
  assert.ok(down.calls.partner < 10, `partner calls ${down.calls.partner}`);
  // Due jobs fail and are put back for 1 s at a time; once it is back it is 100% busy catching up.
  assert.ok(summary(r, 7.9, 8).scheduled.due > 3300, `scheduled ${summary(r, 7.9, 8).scheduled.due}`);
  const after = summary(r, 8.5, 10);
  assert.ok(after.util.worker > 0.97, `worker ${after.util.worker}`);
  // Lateness counts from each job's due time, through its failed tries: the oldest waiting job came
  // due during the outage and has waited the outage plus its turn in the catch-up line, ~3 s by 10 s.
  assert.ok(maxLateness(r, 8, 10) > 2500 && maxLateness(r, 8, 10) < 3500, `late by ${maxLateness(r, 8, 10)}`);
  // Callers never noticed: scheduling and status still work.
  assert.equal(summary(r, 1).errorRate, 0);
});

test("broken: a pool of workers, one dies — ~50 jobs start over, the rest stay on time", () => {
  const r = run(workerPool, { ...S, faults: killAt6("worker-2") });
  const cut = cutOff(r, 6);
  assert.ok(cut > 30 && cut < 70, `cut off ${cut}`);
  const s = summary(r, 6.2, 8);
  assert.ok(s.calls.partner > 420 && s.calls.partner < 560, `jobs still running: ${s.calls.partner} a second`);
  assert.ok(maxLateness(r, 6, 10) < 50, `late by ${maxLateness(r, 6, 10)}`);
});

test("broken: top of the hour — 1,000 jobs at once, the last start over a second late", () => {
  const r = run(topOfHour, S);
  assert.ok(maxLateness(r, 2, 10) > 1000, `late by ${maxLateness(r, 2, 10)}`);
  assert.ok(saturated(r, 2, 10) > 0.65 && saturated(r, 2, 10) < 0.85, `consumers all busy ${saturated(r, 2, 10)} of the time`);
});

test("start times spread out: the same 1,000 jobs a second, none more than ~10 ms late", () => {
  const r = run(jittered, S);
  const s = summary(r, 2);
  assert.ok(s.calls.due > 950 && s.calls.due < 1100, `jobs ${s.calls.due} a second`);
  assert.ok(maxLateness(r, 2, 10) < 20, `late by ${maxLateness(r, 2, 10)}`);
  assert.ok(saturated(r, 2, 10) < 0.05, `consumers all busy ${saturated(r, 2, 10)} of the time`);
  // Little's law: ~1,000 jobs a second x ~0.43 s each = ~440 of 600 consumers busy.
  assert.ok(s.util.due > 0.68 && s.util.due < 0.8, `consumers ${s.util.due}`);
});
