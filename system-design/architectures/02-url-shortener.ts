/**
 * 02. URL Shortener
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Turn a long URL into a short code (sho.rt/aZ3k9) and send anyone who opens the short
 *   link to the long one. About 100 redirects for every new link, a few links get most clicks,
 *   and one viral link can take a third of all traffic.
 *
 * Approach: Grow one bottleneck at a time
 *   1. One database answers every redirect. 2. A cache keeps the popular links in memory.
 *   3. The link table is split by short code over several databases (shards). 4. A CDN answers
 *   redirects from servers near each user.
 *
 * Cost: one database ~1,970 redirects a second (34% fail at 3,000); with a cache of the top 10%
 *   of links, 80% of redirects hit it and the database is 33% busy at 3,000 a second; at 5,000 a
 *   second with 15% writes the one database is full; 4 shards run 31-40% busy each; a CDN cuts the
 *   median redirect from 45 to 20 ms (the p99 stays ~260 ms: far users' edge misses still cross
 *   the ocean) and raises the bill from about $2 to $10 an hour.
 *
 * Pattern: cache-aside + hash sharding
 * Key insight: A redirect is a lookup of one immutable key, so it caches almost perfectly: the
 *   hottest links never reach the database. Writes and stored rows do not cache, so they decide
 *   when to shard; split by the short code so every lookup goes to exactly one shard.
 * Tradeoffs: A redirect answered by the browser's own memory (after a 301) or by the CDN never
 *   reaches the origin, so those clicks must be counted elsewhere (CDN logs); an app-cache hit
 *   still passes through the app server and can be counted there. Sharding makes "all links of one user" a query to every shard. A popular
 *   key still lands on one shard and one cache machine.
 * Staff notes: Size the cache from the popularity curve, not the total number of links. Choose
 *   the shard key from the main lookup (the short code). Plan many more logical shards than
 *   machines so a later move is a copy, not a re-hash. Decide 301 vs 302 on purpose: a permanent
 *   redirect is cached by browsers and loses analytics.
 * Interview signals: "design TinyURL / bit.ly", "how do you generate short codes",
 *   "read-heavy", "hot key", "how would you shard this", "301 or 302".
 * Real world: Bitly and TinyURL serve redirects at very high read-to-write ratios. Short codes
 *   are commonly a counter or random number written in base 62 (a-z, A-Z, 0-9): 7 characters
 *   give 62^7, about 3.5 trillion codes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, cdn, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same kind of traffic: 100,000 links, 99 redirects for every new link,
// popularity following a Zipf curve. In a "viral" world one link takes about a third of all
// clicks. A redirect costs the app 1 ms of CPU (2 ms to create a link); the database spends
// 2 ms finding one row by its short code and 5 ms inserting one.
const traffic = (o: { qps: number; writes?: number; viral?: boolean; edge?: "origin" | "cdn" }) =>
  clients({
    to: "lb",
    qps: knob("qps", o.qps, [10, 1_000_000]),
    // From stage 4, a redirect is sent as the "static" kind: the kind of request a CDN can answer.
    mix: o.edge
      ? { read: 0, write: knob("writes", o.writes ?? 0.01, [0, 0.5]), static: 1 - (o.writes ?? 0.01) }
      : { read: 1 - (o.writes ?? 0.01), write: knob("writes", o.writes ?? 0.01, [0, 0.5]) },
    keys: 100_000,
    skew: o.viral ? 1.4 : 1,
    ...(o.edge ? { farShare: 0.3 } : {}),
    ...(o.edge === "cdn" ? { staticTo: "cdn" } : {}),
  });
const lb = () => loadBalancer({ to: "app", healthCheckMs: 1000 });
const APP_MS = { read: 1, write: 2, static: 1 };
const apps = (n: number, calls: Parameters<typeof server>[0]["calls"]) =>
  server({ replicas: knob("apps", n, [1, 20]), cores: 4, serviceMs: APP_MS, calls });
const links = (shards?: number) =>
  database({ ...(shards ? { shards: knob("shards", shards, [1, 16]) } : {}), cores: 4, readMs: 2, writeMs: 5 });

// @why Stage 1: a redirect is one database lookup: "which long URL belongs to aZ3k9?". Creating a link inserts one row.
export const oneDatabase = design("1. One database", {
  users: traffic({ qps: 1000 }),
  lb: lb(),
  app: apps(3, ["db"]),
  db: links(),
});

// @why A link goes viral: one link gets a third of all clicks and traffic triples. Every click is still a database read.
export const viralNoCache = design("1. A viral link, no cache", {
  users: traffic({ qps: 3000, viral: true }),
  lb: lb(),
  app: apps(3, ["db"]),
  db: links(),
});

const cached = (o: { qps: number; writes?: number; viral?: boolean }, name: string) =>
  design(name, {
    users: traffic(o),
    lb: lb(),
    // @why Stage 2: a redirect looks in the cache first and asks the database only on a miss. Links never change, so nothing needs invalidating.
    app: apps(3, { read: [cacheAside("cache", "db")], write: ["db"] }),
    cache: cache({ capacity: knob("cacheKeys", 10_000, [0, 100_000]) }),
    db: links(),
  });
export const withCache = cached({ qps: 3000 }, "2. Cache the redirects");
// @why The same cache when a link goes viral: the viral link is the hottest key, so it is always in memory.
export const viralCached = cached({ qps: 3000, viral: true }, "2. A viral link, with the cache");
// @why A bulk API customer starts creating links: 15 in every 100 requests are now writes, and a write cannot be cached.
export const manyWrites = cached({ qps: 5000, writes: 0.15 }, "2. Many new links, one database");

const sharded = (o: { qps: number; writes?: number; viral?: boolean; noCache?: boolean }, name: string) =>
  design(name, {
    users: traffic(o),
    lb: lb(),
    app: apps(4, o.noCache ? ["db"] : { read: [cacheAside("cache", "db")], write: ["db"] }),
    ...(o.noCache ? {} : { cache: cache({ capacity: knob("cacheKeys", 10_000, [0, 100_000]) }) }),
    // @why Stage 3: the link table is split by short code over 4 databases. hash(code) picks the shard, so every lookup and every insert goes to exactly one of them.
    db: links(4),
  });
export const shards = sharded({ qps: 5000, writes: 0.15 }, "3. Shard the links by short code");
// @why Shards without the cache in front, when one link goes viral: all of its clicks land on the one shard that holds it.
export const hotShard = sharded({ qps: 5000, viral: true, noCache: true }, "3. A viral link on shards without a cache");
// @why The same viral link on shards, with the cache in front: the cache answers its clicks before they reach any shard.
export const hotShardCached = sharded({ qps: 5000, viral: true }, "3. A viral link on shards, with the cache");

const edge = (withCdn: boolean, name: string) =>
  design(name, {
    users: traffic({ qps: 3000, edge: withCdn ? "cdn" : "origin" }),
    ...(withCdn ? { cdn: cdn({ to: "lb", capacity: knob("edgeKeys", 10_000, [0, 100_000]) }) } : {}),
    lb: lb(),
    app: apps(3, { static: [cacheAside("cache", "db")], write: ["db"] }),
    cache: cache({ capacity: knob("cacheKeys", 10_000, [0, 100_000]) }),
    db: links(4),
  });
// @why 30% of users are on another continent, 120 ms from the one region that answers redirects.
export const fromOrigin = edge(false, "4. Redirects from one region");
// @why Stage 4: a CDN keeps the popular redirects on servers about 10 ms from every user; a miss goes back to the origin.
export const withCdn = edge(true, "4. Redirects at the edge (CDN)");

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const shardsByLoad = (u: number[]) => [...u].sort((a, b) => b - a);

test("one database: 1,000 redirects a second, all fast", () => {
  const s = summary(run(oneDatabase, S), 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 < 50, `p50 ${s.p50}`);
  assert.ok(s.util.db > 0.45 && s.util.db < 0.6, `db ${s.util.db}`);
});

test("broken: one database — a viral link at 3,000 a second floods it", () => {
  const r = run(viralNoCache, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.95 && s.util.app < 0.2, `db ${s.util.db}, app ${s.util.app}`);
  assert.ok(s.errorRate > 0.25, `errors ${s.errorRate}`);
  assert.ok(s.ok > 1850 && s.ok < 2100, `served ${s.ok} a second`);
});

test("cache: ordinary traffic, 8 in 10 redirects come from memory", () => {
  const s = summary(run(withCache, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.75 && s.hitRate.cache < 0.85, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db < 0.4, `db ${s.util.db}`);
});

test("cache: the viral 3,000 a second, and the database is nearly idle", () => {
  const s = summary(run(viralCached, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.98, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db < 0.1, `db ${s.util.db}`);
});

test("broken: cache — many new links fill the one database", () => {
  const r = run(manyWrites, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.95 && s.errorRate > 0.2 && s.errorRate < 0.35, `db ${s.util.db}, errors ${s.errorRate}`);
  assert.ok(s.hitRate.cache > 0.75, "the cache still answers 8 in 10 redirects; it is the writes that fill the database");
});

test("shards: four databases share the same new links", () => {
  const s = summary(run(shards, S), 3);
  assert.equal(s.errorRate, 0);
  assert.equal(s.replicaUtil.db.length, 4);
  assert.ok(s.replicaUtil.db.every((u) => u > 0.25 && u < 0.45), `${s.replicaUtil.db}`);
});

test("broken: shards — without the cache, the viral link's shard is full and the rest are not", () => {
  const s = summary(run(hotShard, S), 3);
  const [hottest, next] = shardsByLoad(s.replicaUtil.db);
  assert.ok(hottest > 0.95 && next < 0.6, `${s.replicaUtil.db}`);
  assert.ok(s.errorRate > 0.08 && s.errorRate < 0.2, `errors ${s.errorRate}`);
});

// The viral link alone is about a third of 5,000 clicks x 2 ms over 4 cores: about 80% of one
// shard. More shards only take other keys off its shard; they cannot go below that.
test("more shards: 8 stop the errors, but the viral link's shard is still 96% busy", () => {
  const s = summary(run(hotShard, { ...S, knobs: { shards: 8 } }), 3);
  const [hottest, next] = shardsByLoad(s.replicaUtil.db);
  assert.equal(s.errorRate, 0);
  assert.ok(hottest > 0.9 && hottest < 0.99 && next < 0.5, `${s.replicaUtil.db}`);
});

test("more shards: 16, and the viral link's shard is still 86% busy", () => {
  const s = summary(run(hotShard, { ...S, knobs: { shards: 16 } }), 3);
  const [hottest, next] = shardsByLoad(s.replicaUtil.db);
  assert.equal(s.errorRate, 0);
  assert.ok(hottest > 0.8 && hottest < 0.9 && next < 0.4, `${s.replicaUtil.db}`);
});

test("shards with the cache: the viral link never reaches its shard", () => {
  const s = summary(run(hotShardCached, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.97, `hit ${s.hitRate.cache}`);
  assert.ok(s.replicaUtil.db.every((u) => u < 0.06), `${s.replicaUtil.db}`);
  assert.ok(s.util.cache > 0.15 && s.util.cache < 0.35, `the one cache machine holding the viral link: ${s.util.cache}`);
});

test("broken: redirects from one region — far users wait for every redirect", () => {
  const s = summary(run(fromOrigin, S), 3);
  assert.ok(s.staticP50 < 50 && s.staticP99 > 200 && s.staticP99 < 300, `p50 ${s.staticP50}, p99 ${s.staticP99}`);
});

test("CDN: redirects answered near every user", () => {
  const before = summary(run(fromOrigin, S), 3);
  const after = summary(run(withCdn, S), 3);
  assert.ok(before.staticP50 > 40 && after.staticP50 < 25, `p50 ${before.staticP50} -> ${after.staticP50}`);
  assert.ok(after.hitRate.cdn > 0.75 && after.hitRate.cdn < 0.85, `edge hit ${after.hitRate.cdn}`);
  // A miss travels the user's own distance to the origin: about 20% miss x 30% far users = 6 in
  // 100 redirects still cross the ocean, more than 1 in 100, so the p99 does not improve.
  assert.ok(before.staticP99 > 200 && after.staticP99 > 200, `p99 ${before.staticP99} -> ${after.staticP99}`);
  assert.ok(after.hitRate.cache < 0.15, `only cold links reach the origin cache: ${after.hitRate.cache}`);
  assert.ok(before.util.app > 0.2 && after.util.app < 0.07, `app ${before.util.app} -> ${after.util.app}`);
  assert.ok(after.costPerHour > 4 * before.costPerHour && after.costPerHour < 6 * before.costPerHour, `cost ${before.costPerHour} -> ${after.costPerHour}`);
});

test("broken: CDN — even 60,000 links at the edge leave the far users' slow tail", () => {
  const s = summary(run(withCdn, { ...S, knobs: { edgeKeys: 60_000 } }), 3);
  // 96% hit, so about 4% miss x 30% far = still more than 1 in 100 redirects crossing the ocean.
  assert.ok(s.hitRate.cdn > 0.94 && s.hitRate.cdn < 0.97 && s.staticP99 > 200, `hit ${s.hitRate.cdn}, p99 ${s.staticP99}`);
});
