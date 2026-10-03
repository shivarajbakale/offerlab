/**
 * 10. View Counter
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Every time someone watches a video, its view count goes up by one. Views arrive far
 *   faster than one database can record them one by one, and they are lopsided: a few popular
 *   videos get most of them, and one viral video can get a third of all views on its own.
 *
 * Approach: Make the database do fewer, bigger writes
 *   1. One database, one UPDATE per view. 2. Shard the counters by video, so several primaries
 *   share the writes; a viral video still pins its own shard. 3. Put views on a queue and let
 *   consumers add them up and write one batch for every 50 views: the database barely notices,
 *   and counts trail reality by the time a view spends in the queue.
 *
 * Cost: one database ~800 views a second (4 cores, 5 ms a write); 4 shards about 2,500 with
 *   normal traffic, set by the busiest shard (full at ~2,700, 10% of views failing at 3,000), not
 *   4 x 800; a viral video keeps its shard 100% busy at 2,000 (CPU only in the simulator; a real
 *   hot row is capped sooner by its row lock); batching runs 2,000 views a second on one
 *   database at 5% busy, if there are enough consumers to keep up.
 *
 * Pattern: write batching (aggregate before you write), sharding
 * Key insight: A counter does not need every increment stored as it happens, only the sum. Add
 *   increments up in memory and write the total: 50 views become one write. Sharding spreads
 *   different keys, but it cannot split one key; batching shrinks the writes for that key too.
 * Tradeoffs: Counts are late by the time a view waits in the queue (eventual consistency), and
 *   a consumer that dies after reading a batch but before writing it can lose or double-count it,
 *   depending on when it acknowledges the messages.
 * Staff notes: Alert on the age of the oldest message, not just the backlog size: that age is
 *   exactly how stale every count is. Decide up front whether a lost or doubled view matters
 *   (ad billing: yes; a "1.2M views" label: no), because exact counting costs far more.
 * Interview signals: "count views / likes", "hot key", "write-heavy", "Zipf", "approximate is
 *   fine", "celebrity problem".
 * Real world: YouTube's public view counts have been known to stall and then jump while views
 *   are verified and aggregated. Counting pipelines built on Kafka with stream processors (Flink,
 *   Kafka Streams) that pre-aggregate before writing are a common design.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every request is one view: a write that adds 1 to that video's counter. There are 100,000
// videos and their popularity follows a Zipf curve: with skew 1 the top video gets about 8% of
// views; with skew 1.5 (one video has gone viral) it gets about 38%.
const views = (skew = 1) => clients({ to: "lb", qps: knob("qps", 2000, [10, 1_000_000]), mix: { read: 0, write: 1 }, skew });
// The web tier is never the limit here: four app servers, 1 ms of CPU to accept a view.
const web = (next: string) => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ replicas: 4, cores: 4, serviceMs: { read: 1, write: 1 }, calls: [next] }),
});
// An UPDATE that adds 1 to a row and commits it durably costs the database 5 ms of CPU.
const DB = { cores: 4, readMs: 2, writeMs: 5 };

// @why Stage 1: every view runs "UPDATE videos SET views = views + 1 WHERE id = ?" on one database.
export const oneDatabase = design("1. One database, an UPDATE per view", {
  users: views(),
  ...web("db"),
  db: database(DB),
});

// @why Stage 2: split the counters over several databases by video id (sharding). Each shard is
// @why its own primary and takes the writes for its share of the videos.
export const sharded = design("2. Shard the counters", {
  users: views(),
  ...web("db"),
  db: database({ ...DB, shards: knob("shards", 4, [1, 16]) }),
});

// @why The same shards on the day one video goes viral: the skew rises from 1 to 1.5, and that
// @why one video's views all land on the one shard that owns it.
export const viral = design("2. A video goes viral", {
  users: views(1.5),
  ...web("db"),
  db: database({ ...DB, shards: knob("shards", 4, [1, 16]) }),
});

// @why Stage 3: the app only drops each view on a queue and answers at once. Consumers take views
// @why off in batches of about 50, add them up per video, and write the sums: one database
// @why write per 50 views (fanout 0.02). Taking a batch, summing it and writing takes ~200 ms.
const batched = (consumers: number, name: string) =>
  design(name, {
    users: views(1.5),
    ...web("counts"),
    counts: queue({ label: "View queue", consumers: knob("consumers", consumers, [1, 200]), workMs: 200, to: "db", fanout: 0.02 }),
    db: database(DB),
  });
export const batching = batched(20, "3. Batch the increments");
// @why The same design with 4 consumers: each can write about 5 batches a second, so 4 handle
// @why 20 batches a second, and 2,000 views a second make 40.
export const fewConsumers = batched(4, "3. Too few consumers");

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("one database: 500 views a second, each an UPDATE, all recorded", () => {
  const s = summary(run(oneDatabase, { ...S, knobs: { qps: 500 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db > 0.55 && s.util.db < 0.7, `db ${s.util.db}`);
});

test("broken: one database — 2,000 views a second need 2.5 databases' worth of writes", () => {
  const r = run(oneDatabase, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.98, `db ${s.util.db}`);
  assert.ok(s.util.app < 0.1, `app ${s.util.app}`);
  assert.ok(s.errorRate > 0.5 && s.errorRate < 0.7, `errors ${s.errorRate}`);
});

test("shards: four shards record 2,000 views a second", () => {
  const s = summary(run(sharded, S), 3);
  assert.equal(s.errorRate, 0);
  const u = s.replicaUtil.db;
  assert.equal(u.length, 4);
  assert.ok(u.every((x) => x > 0.45 && x < 0.85), `${u}`);
});

test("broken: four shards at 3,000 views a second — the busiest shard fills first", () => {
  const ok = summary(run(sharded, { ...S, knobs: { qps: 2500 } }), 3);
  assert.equal(ok.errorRate, 0);
  assert.ok(Math.max(...ok.replicaUtil.db) < 0.97, `at 2,500 the busiest shard ${sortDown(ok.replicaUtil.db)}`);
  const s = summary(run(sharded, { ...S, knobs: { qps: 3000 } }), 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.db);
  assert.ok(hot > 0.98 && rest.every((x) => x < 0.9), `shards ${hot}, ${rest}`);
  assert.ok(s.errorRate > 0.05 && s.errorRate < 0.15, `errors ${s.errorRate}`);
});

test("broken: a viral video — its shard is full while the others idle", () => {
  const r = run(viral, S);
  const s = summary(r, 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.db);
  assert.ok(hot > 0.98, `hot shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.55), `others ${rest}`);
  // App workers wait on the hot shard, so views of every other video fail too.
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.1, `errors ${s.errorRate}`);
});

test("broken: a viral video — sixteen shards, and its shard is still nearly full", () => {
  const s = summary(run(viral, { ...S, knobs: { shards: 16 } }), 3);
  const sorted = sortDown(s.replicaUtil.db);
  assert.ok(sorted[0] > 0.9, `hot shard ${sorted[0]}`);
  assert.ok(sorted[8] < 0.1, `median shard ${sorted[8]}`);
  assert.ok(s.costPerHour > 6, `cost ${s.costPerHour}`);
});

test("batching: the viral day on one database, 5% busy", () => {
  const s = summary(run(batching, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db < 0.08, `db ${s.util.db}`);
  assert.ok(s.p99 < 60, `p99 ${s.p99}`);
  assert.ok(s.backlog.counts < 10 && s.oldestMs.counts < 300, `backlog ${s.backlog.counts}, oldest ${s.oldestMs.counts}`);
  assert.ok(s.costPerHour < 1.2, `cost ${s.costPerHour}`);
});

test("broken: too few consumers — users see nothing wrong, and the counts fall further behind every second", () => {
  const r = run(fewConsumers, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.counts > 0.98, `consumers ${s.util.counts}`);
  const mid = summary(r, 4.9, 5);
  const end = summary(r, 9.9, 10);
  assert.ok(end.backlog.counts > 1.7 * mid.backlog.counts, `backlog ${mid.backlog.counts} -> ${end.backlog.counts}`);
  assert.ok(end.oldestMs.counts > 4000, `oldest ${end.oldestMs.counts}`);
});
