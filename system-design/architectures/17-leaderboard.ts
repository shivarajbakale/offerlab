/**
 * 17. Leaderboard
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Players finish games and submit scores; everyone wants to see the top of the board,
 *   and each player wants their own rank. There are a thousand boards (one per game and season),
 *   millions of players on the big ones, and on a season's last night one board takes most of
 *   the traffic.
 *
 * Approach: Keep the board sorted in memory, split it by board, cache the hot one
 *   1. SQL: the top 100 come cheaply from an index, but a rank is a count of everyone above you,
 *   so the database does work in proportion to your rank. 2. A Redis sorted set per board:
 *   adding a score and finding a rank cost O(log n). 3. Shard the sorted sets by board: one Redis
 *   runs commands on one core, and the boards stop fitting in one machine's memory. 4. On the
 *   finale, one board pins its shard; the top 100 is the same for everyone, so cache it for a
 *   second and let the shard do only score updates.
 *
 * Cost: SQL ~300 page views a second on 8 cores (20 ms to count a mid-table rank); one Redis
 *   handles the normal 2,000 a second ~42% busy but fails at the finale's 8,000; four shards
 *   carry 8,000 on a normal night but the finale board's shard is full; a 1 s cache of the top
 *   100 brings that shard to ~6% busy, for top lists at most a second old.
 *
 * Pattern: in-memory sorted set (skip list), sharding by entity, short-TTL cache of a hot key
 * Key insight: Ranking is an ordered-index problem. A B-tree index finds the top quickly but
 *   cannot say how many entries come before a given one without walking them; a skip list or
 *   tree that keeps subtree counts answers it in O(log n). Sharding by board keeps every board's
 *   order on one machine, so no query has to merge shards.
 * Tradeoffs: Redis keeps the board in memory, so it must be rebuilt from the durable score
 *   table after a loss. A cached top 100 can be a second old. One board cannot be split across
 *   shards without giving up the exact rank.
 * Staff notes: Ask whether ranks must be exact. Beyond the top few thousand, players accept "top
 *   12%", which a histogram of score buckets answers cheaply. Keep the score table as the
 *   record and the sorted set as a rebuildable index. Break ties on equal scores
 *   deterministically (earlier submission first, encoded into the score).
 * Interview signals: "leaderboard", "top N", "my rank", "real-time ranking", "gaming",
 *   "sorted set", "hot key".
 * Real world: Redis sorted sets (ZADD, ZREVRANGE, ZREVRANK) are the standard leaderboard
 *   building block; their documentation uses a game leaderboard as the example. AWS has
 *   published leaderboard designs on ElastiCache for Redis built the same way.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// Every request is about one board (one game's season): 1,000 boards whose popularity follows a
// Zipf curve. A read is the board page: the top 100 and your own rank. A write is a finished
// game: store the score, then return your new rank. On a normal night (skew 1) the top board
// gets about 13% of requests; on its season finale (skew 2) about 61%.
const players = (o: { qps: number; skew?: number }) =>
  clients({ to: "lb", qps: knob("qps", o.qps, [10, 100_000]), mix: { read: 0.8, write: 0.2 }, keys: 1000, skew: o.skew ?? 1 });
const app = (calls: Parameters<typeof server>[0]["calls"]) => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ replicas: 4, cores: 8, serviceMs: { read: 1, write: 1 }, calls }),
});
// The scores table: one row per player per board, indexed on (board, score). Inserting a score
// costs 2 ms. Reading the top 100 off the index is cheap, but a rank is
// "SELECT COUNT(*) WHERE board = ? AND score > ?": the database steps through every index entry
// above the player. For a player half way down a million-player board that is ~500,000 entries:
// we charge 20 ms of CPU for the page.
const scores = (readMs: number) => database({ label: "Scores (SQL)", cores: 8, readMs, writeMs: 2 });
// Redis runs commands one at a time on one core. A sorted set keeps members ordered by score in
// a skip list that also counts how many members each link jumps over, so ZADD and ZREVRANK cost
// O(log n). The page (ZREVRANGE of 100 members with scores, plus ZREVRANK) costs ~0.25 ms; a
// score update (ZADD, then ZREVRANK) ~0.05 ms.
const sortedSets = (shards = 1) =>
  database({ label: "Redis sorted sets", cores: 1, readMs: 0.25, writeMs: 0.05, connections: 1000, shards, costPerHour: 0.15 });

// @why Stage 1: the database is the leaderboard. Every page counts the rows above you.
export const sql = design("1. SQL: count the rows above you", {
  users: players({ qps: 2000 }),
  ...app(["db"]),
  db: scores(20),
});

// @why Stage 2: each board is a sorted set in Redis. A finished game writes the score row (the
// @why record) and then ZADDs it; a page view reads only Redis.
const withRedis = (name: string, o: { qps: number; skew?: number; shards?: number }) =>
  design(name, {
    users: players(o),
    ...app({ read: ["zset"], write: ["db", "zset"] }),
    db: scores(20),
    zset: sortedSets(o.shards),
  });
export const redis = withRedis("2. A sorted set per board", { qps: 2000 });
// @why The same single Redis on a season's last night: four times the traffic.
export const redisFinale = withRedis("2. One Redis on finale night", { qps: 8000, skew: 2 });

// @why Stage 3: the boards are split over four Redis primaries by board id. A board lives whole
// @why on one shard, so its order, top 100 and ranks never need another machine.
export const sharded = withRedis("3. Shard the boards", { qps: 8000, shards: 4 });
// @why The same four shards on the finale: one board gets 61% of requests, all on its shard.
export const shardedFinale = withRedis("3. Sharded, finale night", { qps: 8000, skew: 2, shards: 4 });

// @why Stage 4: the top 100 is the same for every viewer, so the app keeps it in a cache for one
// @why second. The shard sees score updates and one refill per board per second.
export const cachedTop = design("4. Cache the top 100 for a second", {
  users: players({ qps: 8000, skew: 2 }),
  ...app({ read: [cacheAside("top", "zset")], write: ["db", "zset"] }),
  // A lookup in an in-memory cache of small values costs ~0.02 ms (memcached-style, many threads).
  top: cache({ label: "Top-100 cache", capacity: 1000, ttlMs: knob("ttl", 1000, [100, 60_000]), serviceMs: { read: 0.02, write: 0.02 } }),
  db: scores(20),
  zset: sortedSets(4),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// The finale runs 8,000 requests a second; 3 seconds keep every simulated request a real one.
const F = { seconds: 3, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("sql: 300 page views and scores a second, the database 62% busy", () => {
  const s = summary(run(sql, { ...S, knobs: { qps: 300 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db > 0.55 && s.util.db < 0.68, `db ${s.util.db}`);
});

test("broken: sql — 2,000 a second, and counting ranks fills the database", () => {
  const r = run(sql, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.98, `db ${s.util.db}`);
  assert.ok(s.util.app < 0.03, `app ${s.util.app}`);
  // Score submissions fail as often as page views: they wait behind the rank counts.
  assert.ok(s.errorRate > 0.95, `errors ${s.errorRate}`);
  assert.ok(s.byKind.write!.errorRate > 0.95, `writes ${s.byKind.write!.errorRate}`);
});

test("redis: one sorted set per board, 2,000 a second, Redis 42% busy", () => {
  const s = summary(run(redis, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.zset > 0.38 && s.util.zset < 0.46, `zset ${s.util.zset}`);
  assert.ok(s.util.db < 0.12, `db ${s.util.db}`);
  assert.ok(s.p50 < 46, `p50 ${s.p50}`);
  assert.ok(Math.abs(s.costPerHour - 1.2) < 0.03, `cost ${s.costPerHour}`);
});

test("broken: one Redis on finale night — 8,000 a second is more than one core", () => {
  const r = run(redisFinale, F);
  const s = summary(r, 1);
  assert.equal(bottleneck(r, 1), "zset");
  assert.ok(s.util.zset > 0.98, `zset ${s.util.zset}`);
  assert.ok(s.errorRate > 0.3 && s.errorRate < 0.5, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
});

test("shards: four Redis shards carry 8,000 a second on a normal night", () => {
  const s = summary(run(sharded, F), 1);
  assert.equal(s.errorRate, 0);
  const u = s.replicaUtil.zset;
  assert.equal(u.length, 4);
  assert.ok(u.every((x) => x > 0.3 && x < 0.6), `${u}`);
  assert.ok(Math.abs(s.costPerHour - 1.65) < 0.03, `cost ${s.costPerHour}`);
});

test("broken: sharded, finale night — the finale board's shard is full, the others are not", () => {
  const s = summary(run(shardedFinale, F), 1);
  const [hot, ...rest] = sortDown(s.replicaUtil.zset);
  assert.ok(hot > 0.98, `hot shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.3), `others ${rest}`);
  assert.ok(s.errorRate > 0.07 && s.errorRate < 0.11, `errors ${s.errorRate}`);
  // Workers wait on the hot shard, so boards on the idle shards fail too.
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
});

test("cache: the finale, the top 100 cached for a second, the hot shard 6% busy", () => {
  const s = summary(run(cachedTop, F), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.top > 0.975, `hit ${s.hitRate.top}`);
  const [hot] = sortDown(s.replicaUtil.zset);
  assert.ok(hot > 0.04 && hot < 0.08, `hot shard ${hot}`);
  assert.ok(s.p50 < 46, `p50 ${s.p50}`);
  // Nearly every cached page misses some score sent in the last second (most of them not in the top 100).
  assert.ok(s.staleRate > 0.9, `stale ${s.staleRate}`);
  assert.ok(Math.abs(s.costPerHour - 1.8) < 0.03, `cost ${s.costPerHour}`);
});

test("broken: cache for a minute — a minute-old top 100, and the shard saves almost nothing more", () => {
  const minute = summary(run(cachedTop, { ...F, knobs: { ttl: 60_000 } }), 1);
  // With a 1 s TTL the hot shard was 4-8% busy; with 60 s it is still score updates, 3-7%.
  const hot = sortDown(minute.replicaUtil.zset)[0];
  assert.ok(hot > 0.03 && hot < 0.07, `hot shard ${hot}`);
  assert.ok(minute.hitRate.top > 0.99, `hit ${minute.hitRate.top}`);
  assert.ok(minute.staleRate > 0.9, `stale ${minute.staleRate}`);
});
