/**
 * 21. Metrics Ingestion
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Twenty thousand machines each send a batch of measurements (CPU, memory, request
 *   counts) every ten seconds, and engineers query them on dashboards. Writes never stop and far
 *   outnumber reads; when something breaks, everyone opens a dashboard at once. Do not lose data,
 *   and keep the dashboards working during the incident they are there for.
 *
 * Approach: Absorb writes in a queue, write in bulk, answer dashboards from summaries
 *   1. Agents write straight to the time-series database: it fills, and agents' retries add
 *   load. 2. A queue in front: the API only enqueues; consumers write 20 payloads at a time, and
 *   a fixed number of consumers caps the load on the database. A slowdown becomes
 *   lag instead of errors, if the consumers have headroom to catch up. 3. Downsampled rollups (1
 *   minute, 1 hour) in their own store answer dashboards, so an incident's queries no longer
 *   starve the writes.
 *
 * Cost: direct writes fill an 8-core database near 1,700 requests a second; queued bulk writes
 *   carry 2,000 with the database ~48% busy; a 4x slowdown for 3 s is caught up within 2 s
 *   with 8 consumers, and with 3 the backlog has not shrunk 4 s later; rollups answer an
 *   incident's 200 queries a second at ~17% of a 4-core store.
 *
 * Pattern: queue-based load leveling, write batching, concurrency cap (pull-based consumers),
 *   downsampling (rollups)
 * Key insight: Ingest and query are different workloads. Ingest is steady, huge and tolerant of
 *   seconds of delay, so buffer it and write it in bulk at a rate the database can take. Queries
 *   are bursty and mostly look at long time ranges, so answer them from pre-aggregated data that
 *   is 6 to 360 times smaller than the raw points.
 * Tradeoffs: Data on dashboards is late by the queue's lag. Rollups lose detail (a 1-hour average
 *   hides a 30-second spike unless you also keep the max). Another store to run and keep
 *   consistent with the raw data.
 * Staff notes: Alert on consumer lag (age of the oldest message), and size consumers for catching
 *   up, not just keeping up. Bound every buffer: the agent's local buffer, the queue's retention,
 *   and decide what to drop first when one fills. Cardinality (number of distinct series) is
 *   what usually kills a metrics store, not points per second.
 * Interview signals: "metrics", "monitoring", "time series", "telemetry", "write-heavy",
 *   "Prometheus", "Datadog", "downsampling", "backpressure".
 * Real world: Thanos downsamples Prometheus data to 5-minute and 1-hour resolutions for
 *   long-range queries; Prometheus recording rules precompute expensive queries.
 *   Facebook's Gorilla paper describes compressing points to about 1.4 bytes each.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// 20,000 agents each send one payload (~200 points) every 10 s: 2,000 writes a second. Engineers'
// dashboard queries are 2% of requests normally (40 a second), 10% (200 a second) during an
// incident. Agents that fail wait and retry (100 ms, then 200 ms, with jitter).
const agents = (dashboards = 0.02) =>
  clients({
    to: "lb",
    qps: knob("qps", 2000, [10, 50_000]),
    mix: { read: knob("dashboards", dashboards, [0, 0.3]), write: 1 - dashboards },
    users: 20_000,
    retry: "backoff",
    timeoutMs: { read: 5000, write: 1000 },
  });
// The ingest API: parse and validate a payload (0.5 ms), or run a query (1 ms).
const api = (write: string[], read: string[]) => ({
  lb: loadBalancer({ to: "api" }),
  api: server({ label: "Ingest API", replicas: 4, cores: 4, serviceMs: { read: 1, write: 0.5 }, calls: { read, write } }),
});
// The time-series database, 8 cores. Writing one payload costs 4 ms (find each series in the
// index, append its point, log it). A dashboard query over a day of raw 10-second points across
// many series costs 40 ms.
const tsdb = (writeMs: number) => database({ label: "Time-series DB", cores: 8, readMs: 40, writeMs });
// Consumers take 20 payloads at a time (fanout 0.05: one job per 20 messages), decode and merge
// them (5 ms), and write them in one bulk request. We assume a bulk write of 20 costs 20 ms, a
// quarter of writing them one by one: per-request work and index lookups are shared.
const ingest = (consumers: number, to: string) =>
  queue({ label: "Ingest queue", consumers: knob("consumers", consumers, [1, 50]), workMs: 5, to, fanout: 0.05 });

// @why Stage 1: the API writes each payload to the database, and dashboards query it too.
export const direct = design("1. Agents write straight to the database", {
  users: agents(),
  ...api(["tsdb"], ["tsdb"]),
  tsdb: tsdb(4),
});

// @why Stage 2: the API only enqueues each payload and answers at once. Consumers write them to
// @why the database in bulk; at most `consumers` bulk writes are ever in flight.
const queued = (name: string, o: { consumers: number; dashboards?: number }) =>
  design(name, {
    users: agents(o.dashboards),
    ...api(["ingest"], ["tsdb"]),
    ingest: ingest(o.consumers, "tsdb"),
    tsdb: tsdb(20),
  });
export const buffered = queued("2. A queue and bulk writes", { consumers: 8 });
// @why The same with 3 consumers: enough to keep up on a normal day, with little to spare.
export const noHeadroom = queued("2. Too few consumers to catch up", { consumers: 3 });
// @why The same 8 consumers during an incident: five times the dashboard queries, on raw points.
export const incident = queued("2. An incident: everyone opens dashboards", { consumers: 8, dashboards: 0.1 });

// @why Stage 3: a batch writer stores each bulk write in the raw database and adds it into
// @why 1-minute and 1-hour rollups (sum, count, min, max per series) in their own store.
// @why Dashboards read the rollups: a day at 1-minute resolution is 6 times fewer points than
// @why raw, a month at 1 hour 360 times fewer; a query costs ~2 ms (less than points alone
// @why would give, ~7 ms, because common dashboards' rollups are also pre-merged across hosts).
export const rollups = design("3. Dashboards read downsampled rollups", {
  users: agents(0.1),
  ...api(["ingest"], ["rollups"]),
  ingest: ingest(8, "writer"),
  writer: server({ label: "Batch writer", replicas: 2, cores: 2, serviceMs: { read: 1, write: 2 }, calls: { write: ["tsdb", "rollups"] } }),
  tsdb: tsdb(20),
  rollups: database({ label: "Rollups (1 min, 1 h)", cores: 4, readMs: 2, writeMs: 3 }),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// The database runs at a quarter of its speed from 3 s to 6 s (a compaction, a bad disk).
const SLOW = { ...S, faults: [{ at: 3000, kind: "slow" as const, target: "tsdb", factor: 4, durationMs: 3000 }] };
const at = (r: ReturnType<typeof run>, t: number) => summary(r, t - 0.1, t);

test("direct: 1,200 payloads a second, the database 72% busy", () => {
  const s = summary(run(direct, { ...S, knobs: { qps: 1200 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.tsdb > 0.67 && s.util.tsdb < 0.77, `tsdb ${s.util.tsdb}`);
});

test("broken: direct writes at 2,000 a second — the database is full and agents' retries pile on", () => {
  const r = run(direct, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "tsdb");
  assert.ok(s.util.tsdb > 0.98, `tsdb ${s.util.tsdb}`);
  assert.ok(s.util.api < 0.1, `api ${s.util.api}`);
  assert.ok(s.errorRate > 0.1 && s.errorRate < 0.2, `errors ${s.errorRate}`);
  assert.ok(s.retries > 1200, `retries ${s.retries}`);
  assert.ok(s.ok < 1800, `stored ${s.ok}`);
});

test("queue: 2,000 a second written 20 at a time, the database 48% busy", () => {
  const s = summary(run(buffered, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.tsdb > 0.43 && s.util.tsdb < 0.53, `tsdb ${s.util.tsdb}`);
  assert.ok(s.byKind.write!.p50 < 45, `agent p50 ${s.byKind.write!.p50}`);
  assert.ok(s.backlog.ingest < 5, `backlog ${s.backlog.ingest}`);
  assert.ok(s.util.ingest > 0.28 && s.util.ingest < 0.4, `consumers ${s.util.ingest}`);
  assert.ok(Math.abs(s.costPerHour - 1.11) < 0.02, `cost ${s.costPerHour}`);
});

test("slow database: agents notice nothing, the lag grows to ~2 s and is gone 2 s after recovery", () => {
  const r = run(buffered, SLOW);
  assert.equal(summary(r).errorRate, 0);
  assert.ok(summary(r, 3, 6).byKind.write!.p99 < 50, `agent p99 ${summary(r, 3, 6).byKind.write!.p99}`);
  const worst = at(r, 6);
  assert.ok(worst.backlog.ingest > 130 && worst.backlog.ingest < 180 && worst.oldestMs.ingest > 1500 && worst.oldestMs.ingest < 2500, `at 6 s ${worst.backlog.ingest}, ${worst.oldestMs.ingest}`);
  assert.ok(at(r, 8).backlog.ingest < 5, `at 8 s ${at(r, 8).backlog.ingest}`);
});

test("few consumers: 3 keep up on a normal day, 86% busy", () => {
  const s = summary(run(noHeadroom, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.ingest > 0.8 && s.util.ingest < 0.9, `consumers ${s.util.ingest}`);
  assert.ok(s.backlog.ingest < 10, `backlog ${s.backlog.ingest}`);
});

test("broken: too few consumers to catch up — 4 s after the database recovers, the lag has not shrunk", () => {
  const r = run(noHeadroom, SLOW);
  assert.equal(summary(r).errorRate, 0);
  const worst = at(r, 6);
  const later = at(r, 10);
  assert.ok(worst.backlog.ingest > 150, `at 6 s ${worst.backlog.ingest}`);
  assert.ok(later.backlog.ingest > 0.8 * worst.backlog.ingest, `at 10 s ${later.backlog.ingest}`);
  assert.ok(later.oldestMs.ingest > 1000, `oldest at 10 s ${later.oldestMs.ingest}`);
  // Consumers were busy 86% of the time on a normal day: 14% of their capacity spare to catch up with.
  assert.ok(summary(r, 7).util.ingest > 0.95, `consumers ${summary(r, 7).util.ingest}`);
});

test("broken: an incident — 200 dashboard queries a second on raw points starve the writes", () => {
  const r = run(incident, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "tsdb");
  assert.ok(s.util.tsdb > 0.98, `tsdb ${s.util.tsdb}`);
  assert.equal(s.errorRate, 0);
  assert.ok(s.byKind.read!.p50 > 300, `dashboard p50 ${s.byKind.read!.p50}`);
  const mid = at(r, 5);
  const end = at(r, 10);
  assert.ok(end.backlog.ingest > 2 * mid.backlog.ingest, `backlog ${mid.backlog.ingest} -> ${end.backlog.ingest}`);
  assert.ok(end.oldestMs.ingest > 5000, `oldest ${end.oldestMs.ingest}`);
});

test("rollups: the incident's dashboards read rollups, nobody waits", () => {
  const s = summary(run(rollups, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.rollups > 0.12 && s.util.rollups < 0.22, `rollups ${s.util.rollups}`);
  assert.ok(s.util.tsdb > 0.18 && s.util.tsdb < 0.27, `tsdb ${s.util.tsdb}`);
  assert.ok(s.byKind.read!.p50 < 50, `dashboard p50 ${s.byKind.read!.p50}`);
  assert.ok(s.backlog.ingest < 5, `backlog ${s.backlog.ingest}`);
  assert.ok(Math.abs(s.costPerHour - 1.79) < 0.02, `cost ${s.costPerHour}`);
});
