/**
 * 23. Social Graph
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Users follow and unfollow each other. Opening someone's profile shows how many
 *   followers they have, the first page of those followers, and whether you follow them. A few
 *   celebrities have tens of millions of followers and get a large share of all profile views.
 *
 * Approach: Store the graph in the direction each question asks, then cache the shared part
 *   1. One table of (follower, followee) rows; count the followers on every profile view.
 *   2. Store the count, keep the edges twice (followers of X on X's shard, followees of me on my
 *   shard) and shard both by account. 3. A celebrity pins its shard: cache the part of a profile
 *   that is the same for every viewer (count, first page) and batch the count updates.
 *
 * Cost: counting on read (8 ms) carries ~500 requests a second on one database, so at 10,000 a
 *   second almost all fail. Stored counts and 8 shards by account carry 10,000 a second with the
 *   busiest shard ~68% busy. A celebrity with ~39% of requests needs ~1.5 shards' worth of CPU on
 *   its own: its shard is full and ~4 in 10 requests fail, with 8 shards or 32. Caching the shared
 *   part of a profile answers ~94% of views from memory; the celebrity's shard drops to ~59%, busy
 *   mostly with "do I follow X" lookups.
 *
 * Pattern: adjacency lists stored in both directions, denormalized counters, sharding by
 *   account, caching the viewer-independent part of a read
 * Key insight: A graph has two questions per edge (who follows X, whom do I follow) and each
 *   wants the edge stored next to a different account. Store it twice, each copy sharded by the
 *   account that asks. Counting is a read you can do once at write time instead of on every view.
 * Tradeoffs: Two copies of every edge must agree (one is updated asynchronously and can lag);
 *   stored counts drift if an update is lost and need a periodic recount; a celebrity's edges all
 *   live on one shard.
 * Staff notes: Page follower lists with a cursor (the last follower id seen), never OFFSET.
 *   Treat the top accounts as a separate tier: cached, their counts batched. Expect follow storms
 *   (a celebrity tweets "follow my new account") to hit one count row.
 * Interview signals: "design Twitter's follow graph", "followers count", "mutual friends",
 *   "celebrity / hot user", "how do you shard a graph".
 * Real world: Twitter's FlockDB (open-sourced in 2010) kept follow edges as adjacency lists in
 *   both directions on sharded MySQL. Facebook's TAO caches graph objects and associations in
 *   front of sharded MySQL.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: 10,000 requests a second. 96% open someone's profile (a
// read), 4% follow or unfollow someone (a write). A request's key is the account it is about:
// 1,000,000 accounts, Zipf popularity. With skew 1 the top account gets ~7% of requests; when a
// celebrity joins (skew 1.5), ~39%.
const people = (skew = 1) =>
  clients({ to: "lb", qps: knob("qps", 10_000, [10, 100_000]), mix: { read: 0.96, write: 0.04 }, keys: 1_000_000, skew, users: 20_000 });
const apps = (calls: Parameters<typeof server>[0]["calls"]) => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ label: "Graph API", replicas: 6, cores: 4, serviceMs: { read: 1, write: 1 }, calls }),
});

// @why Stage 1: one table follows(follower, followee) with an index on followee. A profile view
// @why runs COUNT(*) over X's follower rows, reads the first page and checks (X, me): ~8 ms on
// @why average (a celebrity's count is far slower; the simulator uses one average).
export const countOnRead = design("1. One table, count on read", {
  users: people(),
  ...apps(["db"]),
  db: database({ cores: 4, readMs: 8, writeMs: 3 }),
});

// @why Stage 2: the edges are stored twice. followers(X, follower) lives on X's shard, with a
// @why stored count row for X: a profile view is a few point and range reads, ~1.5 ms. A follow
// @why inserts the edge and adds 1 to X's count in one transaction on X's shard (4 ms), then a
// @why queued job adds the edge to following(me, X) on my own shard (the other direction).
const twoWays = (name: string, skew: number) =>
  design(name, {
    users: people(skew),
    ...apps({ read: ["followers"], write: ["followers", "fanout"] }),
    followers: database({ label: "Followers by account", cores: 4, readMs: 1.5, writeMs: 4, shards: knob("shards", 8, [1, 32]) }),
    fanout: queue({ label: "Following updates", consumers: 20, workMs: 2, to: "following" }),
    following: database({ label: "Following by account", cores: 4, readMs: 1.5, writeMs: 3, shards: 2 }),
  });
export const sharded = twoWays("2. Both directions, sharded by account", 1);
// @why The same design the week a celebrity joins: one account gets ~39% of all requests, and
// @why all of its followers, its count and its profile views are on one shard.
export const celebrity = twoWays("2. A celebrity joins", 1.5);

// @why Stage 3: the part of a profile that is the same for every viewer (count, first page of
// @why followers) is cached for 5 s. Only "do I follow X", a 0.5 ms point lookup of (X, me),
// @why still goes to X's shard. A follow inserts the edge (2 ms); the count is added up on the
// @why queue in batches of ~50 and written as one sum, so the celebrity's count row is not
// @why locked 150 times a second.
export const cached = design("3. Cache the shared part of a profile", {
  users: people(1.5),
  ...apps({ read: [cacheAside("profiles", "followers"), "followers"], write: ["followers", "fanout", "counts"] }),
  profiles: cache({ label: "Profile cache", capacity: knob("cachedProfiles", 50_000, [0, 1_000_000]), ttlMs: 5000 }),
  followers: database({ label: "Followers by account", cores: 4, readMs: 0.5, writeMs: 2, shards: 8 }),
  fanout: queue({ label: "Following updates", consumers: 20, workMs: 2, to: "following" }),
  following: database({ label: "Following by account", cores: 4, readMs: 1.5, writeMs: 3, shards: 2 }),
  counts: queue({ label: "Count increments", consumers: 4, workMs: 50, to: "followers", fanout: 0.02 }),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("count on read: 400 profile views a second, the database 78% busy", () => {
  const s = summary(run(countOnRead, { ...S, knobs: { qps: 400 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db > 0.72 && s.util.db < 0.84, `db ${s.util.db}`);
});

test("broken: count on read — 10,000 requests a second, about 500 reach the database", () => {
  const r = run(countOnRead, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.98 && s.util.app < 0.03, `db ${s.util.db}, app ${s.util.app}`);
  assert.ok(s.calls.db > 450 && s.calls.db < 560, `db answers ${s.calls.db}`);
  assert.ok(s.errorRate > 0.95, `errors ${s.errorRate}`);
});

test("both directions, 8 shards: 10,000 requests a second, the busiest shard 68% busy", () => {
  const s = summary(run(sharded, S), 3);
  assert.equal(s.errorRate, 0);
  const [hot, ...rest] = sortDown(s.replicaUtil.followers);
  assert.ok(hot > 0.6 && hot < 0.75, `busiest shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.6), `others ${rest}`);
  // The other direction is kept up by the queue: ~400 jobs a second, never a backlog.
  assert.ok(s.calls.following > 370 && s.calls.following < 430, `following writes ${s.calls.following}`);
  assert.ok(s.backlog.fanout < 20, `backlog ${s.backlog.fanout}`);
  assert.ok(s.costPerHour > 4.4 && s.costPerHour < 4.7, `cost ${s.costPerHour}`);
});

test("broken: a celebrity joins — its shard is full and ~4 in 10 requests fail", () => {
  const r = run(celebrity, S);
  const s = summary(r, 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.followers);
  assert.ok(hot > 0.98, `hot shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.45), `others ${rest}`);
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.33 && s.errorRate < 0.45, `errors ${s.errorRate}`);
});

test("broken: a celebrity on 32 shards — its shard is still full", () => {
  const s = summary(run(celebrity, { ...S, knobs: { shards: 32 } }), 3);
  const sorted = sortDown(s.replicaUtil.followers);
  assert.ok(sorted[0] > 0.98, `hot shard ${sorted[0]}`);
  assert.ok(sorted[16] < 0.05, `median shard ${sorted[16]}`);
  assert.ok(s.errorRate > 0.3, `errors ${s.errorRate}`);
  assert.ok(s.costPerHour > 12.5 && s.costPerHour < 12.9, `cost ${s.costPerHour}`);
});

test("cached shared part: the celebrity's week with no errors, its shard 59% busy", () => {
  const s = summary(run(cached, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.profiles > 0.92, `hit ${s.hitRate.profiles}`);
  const [hot, ...rest] = sortDown(s.replicaUtil.followers);
  assert.ok(hot > 0.5 && hot < 0.67, `celebrity's shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.3), `others ${rest}`);
  // One cache machine takes every profile view: about half busy.
  assert.ok(s.util.profiles > 0.4 && s.util.profiles < 0.55, `cache ${s.util.profiles}`);
  // 400 follows a second become under 10 count writes a second.
  assert.ok(s.calls.counts > 3 && s.calls.counts < 10, `count batches ${s.calls.counts}`);
  assert.ok(s.p50 < 48 && s.costPerHour < 4.9, `p50 ${s.p50}, cost ${s.costPerHour}`);
});
