/**
 * 09. Search Autocomplete
 * Level: Senior
 * Group: Architectures
 *
 * Problem: As a user types in a search box, show the top suggestions for what they have typed so
 *   far. Every keystroke is a read, the answer must arrive in under about 100 ms to feel instant,
 *   and a few short prefixes ("a", "th", "new") get most of the traffic.
 *
 * Approach: Precompute, then cache by prefix, closer and closer to the user
 *   1. Ask the database for the top matches on every keystroke. 2. Cache each prefix's
 *   suggestions; skewed traffic makes a small cache catch most requests. 3. Split the cache over
 *   three machines, so losing one loses a third of it, not all of it. 4. Debounce in the client
 *   and cache the most popular prefixes at the CDN's edge, near users on every continent.
 *
 * Cost: database per keystroke (16 cores, 10 ms a query): about 1,600 keystrokes a second. With a
 *   20,000-prefix cache (93% hits) 4,000 a second leave the database 18% busy. One cache restarting
 *   at 5,000 a second floods it; with three cache machines, losing one leaves it about 60% busy.
 *   Far users' slow tail is 255 ms. An edge cache of 2,000 prefixes (71% hits) answers hits in
 *   ~20 ms for everyone, but far users' misses (~9% of keystrokes) still cross the ocean, so the
 *   p99 stays ~275 ms until the edge holds 50,000 prefixes (97% hits, p99 ~85 ms). The edge costs
 *   about $12 an hour instead of $1.30; debouncing to a third of the requests cuts that to ~$5.
 *
 * Pattern: precomputation + layered caching
 * Key insight: The answer for a prefix depends only on the prefix, not on who types it, so it can
 *   be computed ahead of time and cached anywhere: in a cache server, at the edge, in the browser.
 *   Skew decides how well that works: a few thousand prefixes carry most keystrokes.
 * Tradeoffs: Cached suggestions go stale until refreshed. The database is sized for a warm cache;
 *   a cold one floods it. Edge caching is billed per request.
 * Staff notes: Build the suggestion index offline from query logs (top-k per prefix) and serve it
 *   read-only. Warm caches before taking traffic. Measure hit rate per layer: a cache behind
 *   another cache only sees the leftovers.
 * Interview signals: "design typeahead", "design Google autocomplete", "trie", "top-k",
 *   "every keystroke is a request", "latency budget".
 * Real world: Search boxes at Google, Amazon and LinkedIn suggest completions as you type.
 *   Elasticsearch offers a completion suggester built on an in-memory finite-state structure for
 *   prefix lookups. Browsers and apps commonly debounce input before sending a request.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, cdn, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// Every keystroke sends the text typed so far (the prefix). There are 100,000 distinct prefixes
// in play, and popularity is Zipf with exponent 1.1: short, common prefixes dominate. Suggestions
// are only read here; how they are rebuilt is explained in the lesson, not simulated.
const typing = (o: { qps: number; skew?: number; far?: number; edge?: boolean }) =>
  clients({
    to: "lb",
    ...(o.edge ? { staticTo: "edge" } : {}),
    qps: knob("qps", o.qps, [10, 1_000_000]),
    // A request the edge may answer must be marked "static" in this simulator: the answer is the
    // same for everyone who sends that prefix.
    mix: o.edge ? { read: 0, write: 0, static: 1 } : { read: 1, write: 0 },
    keys: 100_000,
    skew: o.skew ?? 1.1,
    farShare: o.far ?? 0,
  });
const lb = () => loadBalancer({ to: "app", healthCheckMs: 1000 });
const apps = (calls: Parameters<typeof server>[0]["calls"]) =>
  server({ replicas: knob("apps", 3, [1, 30]), cores: 4, serviceMs: { read: 1, write: 1, static: 1 }, calls });
// Finding the top matches for a prefix: scan the matching rows and sort them by popularity, 10 ms.
const db = () => database({ cores: 16, connections: 64, readMs: 10, writeMs: 10 });

// @why Stage 1: each keystroke asks the database for the most popular queries starting with the
// @why prefix. Simple and always fresh; every keystroke costs 10 ms of database CPU.
export const dbPerKeystroke = design("1. Query the database on every keystroke", {
  users: typing({ qps: 500 }),
  lb: lb(),
  app: apps(["db"]),
  db: db(),
});

const cached = (name: string, o: { qps?: number; skew?: number; caches?: number } = {}) =>
  design(name, {
    users: typing({ qps: o.qps ?? 4000, skew: o.skew }),
    lb: lb(),
    app: apps([cacheAside("cache", "db")]),
    cache: cache({ replicas: o.caches ?? 1, capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
    db: db(),
  });
// @why Stage 2: keep each prefix's suggestions in a cache. Look there first; only on a miss ask
// @why the database, then store its answer for the next person who types the same thing.
export const withCache = cached("2. Cache each prefix's suggestions");
// @why The same cache, but traffic spread more evenly over prefixes (Zipf exponent 0.7, not 1.1).
export const flatTraffic = cached("2. Cache, with less skewed prefixes", { skew: 0.7 });
// @why At the evening peak of 5,000 keystrokes a second, everything still rests on one cache machine.
export const oneCache = cached("3. One cache machine at the peak", { qps: 5000 });
// @why Stage 3: three cache machines. Each prefix lives on one of them, chosen by a hash of the
// @why prefix, so losing a machine loses only the prefixes it held.
export const shardedCache = cached("3. Cache split over three machines", { qps: 5000, caches: 3 });

const edge = (name: string, withEdge: boolean) =>
  design(name, {
    users: typing({ qps: 4000, far: 0.3, edge: withEdge }),
    // @why Stage 4: CDN edge servers near every user keep the suggestions for the most popular
    // @why prefixes. A miss goes on to our servers, which still use their own cache.
    ...(withEdge ? { edge: cdn({ to: "lb", capacity: knob("edgeKeys", 2_000, [0, 100_000]) }) } : {}),
    lb: lb(),
    app: apps(withEdge ? { static: [cacheAside("cache", "db")] } : [cacheAside("cache", "db")]),
    cache: cache({ replicas: 3, capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
    db: db(),
  });
// @why The product launches on another continent: 30% of users are now 120 ms away, each way.
export const farUsers = edge("4. Users on another continent", false);
export const withEdge = edge("4. Edge cache for popular prefixes", true);

// --- helpers for the scenarios ---

const S = { seed: 1, seconds: 10 };
const restart = (target: string) => [
  { at: 4500, kind: "kill" as const, target },
  { at: 4500, kind: "restart" as const, target },
];

test("database per keystroke: 500 keystrokes a second, suggestions in 53 ms", () => {
  const s = summary(run(dbPerKeystroke, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 < 60 && s.p99 < 80, `p50 ${s.p50}, p99 ${s.p99}`);
  assert.ok(s.util.db > 0.25 && s.util.db < 0.4, `db ${s.util.db}`);
});

test("broken: database per keystroke — at 4,000 keystrokes a second the database drowns", () => {
  const r = run(dbPerKeystroke, { ...S, knobs: { qps: 4000 } });
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.97 && s.errorRate > 0.5, `db ${s.util.db}, errors ${s.errorRate}`);
  assert.ok(s.p50 > 300, `p50 ${s.p50}`);
});

test("cache: 4,000 keystrokes a second, 93% hits, the database 18% busy", () => {
  const s = summary(run(withCache, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.9, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db < 0.25, `db ${s.util.db}`);
  assert.ok(s.p50 < 50 && s.p99 < 70, `p50 ${s.p50}, p99 ${s.p99}`);
});

test("cache: 1,000 prefixes catch two thirds of keystrokes", () => {
  const s = summary(run(withCache, { ...S, knobs: { cacheKeys: 1000 } }), 3);
  assert.ok(s.hitRate.cache > 0.6 && s.hitRate.cache < 0.72, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db > 0.75, `db ${s.util.db}`);
});

test("cache: 50,000 prefixes catch 97%", () => {
  const s = summary(run(withCache, { ...S, knobs: { cacheKeys: 50_000 } }), 3);
  assert.ok(s.hitRate.cache > 0.95, `hit ${s.hitRate.cache}`);
});

test("broken: less skewed prefixes — the same cache catches 58% and the database fills", () => {
  const r = run(flatTraffic, S);
  const s = summary(r, 3);
  assert.ok(s.hitRate.cache > 0.5 && s.hitRate.cache < 0.65, `hit ${s.hitRate.cache}`);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.95 && s.p99 > 150, `db ${s.util.db}, p99 ${s.p99}`);
});

test("broken: one cache machine restarts at the peak and the database floods", () => {
  const r = run(oneCache, { ...S, faults: restart("cache") });
  const before = summary(r, 1, 4.5);
  assert.ok(before.errorRate === 0 && before.util.db < 0.3, `db before ${before.util.db}`);
  const after = summary(r, 4.5, 6);
  assert.ok(after.hitRate.cache < 0.65 && after.util.db > 0.97, `hit ${after.hitRate.cache}, db ${after.util.db}`);
  assert.ok(after.errorRate > 0.15 && after.p50 > 100, `errors ${after.errorRate}, p50 ${after.p50}`);
  assert.ok(summary(r, 6, 8).p99 > 150, "the slow tail stays over budget while the cache refills");
});

test("three cache machines: one restarts, the hit rate dips to 82%, nobody notices", () => {
  const r = run(shardedCache, { ...S, faults: restart("cache-2") });
  const before = summary(r, 1, 4.5);
  const after = summary(r, 4.5, 6);
  assert.ok(before.hitRate.cache > 0.9 && after.hitRate.cache > 0.75 && after.hitRate.cache < 0.86, `hit ${before.hitRate.cache} -> ${after.hitRate.cache}`);
  assert.ok(after.util.db > 0.45 && after.util.db < 0.7, `db ${after.util.db}`);
  assert.ok(after.errorRate === 0 && after.p99 < 80, `errors ${after.errorRate}, p99 ${after.p99}`);
});

test("broken: users on another continent — their keystrokes take 255 ms", () => {
  const s = summary(run(farUsers, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 < 50 && s.p99 > 230, `p50 ${s.p50}, p99 ${s.p99}`);
});

test("edge cache: popular prefixes answered nearby, for everyone", () => {
  const before = summary(run(farUsers, S), 3);
  const after = summary(run(withEdge, S), 3);
  assert.ok(after.hitRate.edge > 0.65, `edge hit ${after.hitRate.edge}`);
  // Hits take ~20 ms for everyone. 30% far users x 29% misses ≈ 9% of keystrokes still go
  // user -> edge -> across the ocean -> our servers, so they set the p99, a little above before.
  assert.ok(after.p50 < 25, `p50 ${after.p50}`);
  assert.ok(after.p99 > 260 && after.p99 < 290 && after.p99 > before.p99, `p99 ${before.p99} -> ${after.p99}`);
  assert.ok(after.hitRate.cache < 0.8, `cache behind the edge: ${after.hitRate.cache}`);
  assert.ok(Math.abs(after.util.db - before.util.db) < 0.05, `db ${before.util.db} -> ${after.util.db}: the edge takes what our cache already caught`);
  assert.ok(after.costPerHour > 6 * before.costPerHour, `$${before.costPerHour} -> $${after.costPerHour} an hour`);
});

test("edge cache: a bigger edge leaves our own cache only the leftovers", () => {
  const s = summary(run(withEdge, { ...S, knobs: { edgeKeys: 10_000 } }), 3);
  assert.ok(s.hitRate.edge > 0.85 && s.hitRate.cache < 0.5, `edge ${s.hitRate.edge}, cache ${s.hitRate.cache}`);
  // Still 30% x 12% ≈ 3.5% far misses: more than 1 in 100, so the p99 is still the ocean.
  assert.ok(s.p99 > 250, `p99 ${s.p99}`);
});

test("edge cache: holding 50,000 prefixes, far misses drop under 1 in 100 and the tail fits the budget", () => {
  const s = summary(run(withEdge, { ...S, knobs: { edgeKeys: 50_000 } }), 3);
  assert.ok(s.hitRate.edge > 0.96, `edge ${s.hitRate.edge}`);
  assert.ok(s.p99 < 100, `p99 ${s.p99}`);
});

test("debounce: a third of the requests, a third of the edge bill", () => {
  const s = summary(run(withEdge, { ...S, knobs: { qps: 1300 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.costPerHour < 6, `$${s.costPerHour} an hour`);
  assert.ok(s.util.db < 0.1, `db ${s.util.db}`);
});
