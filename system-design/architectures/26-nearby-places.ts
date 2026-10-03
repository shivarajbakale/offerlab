/**
 * 26. Nearby Places
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Users open the app and ask "what restaurants are near me?". Searches arrive by the
 *   thousand every second; new places and reviews are rare. Searches are lopsided by geography:
 *   a few dense city blocks get far more searches than the countryside.
 *
 * Approach: Turn a 2-D search into a lookup of a few keys, then stop repeating it
 *   1. One database, a box query on latitude and longitude. 2. Store each place under its
 *   geohash cell and shard by cell: a search is a few range scans on one shard, but dense city
 *   cells pin their shard. 3. Cache each cell's results: the hot cells are the easiest to cache.
 *   4. Round every search to its cell so the answer is the same for everyone nearby, and let a
 *   CDN answer it.
 *
 * Cost: the box query (10 ms of database CPU) carries ~400 searches a second on one database,
 *   so at 5,000 a second almost none succeed. Geohash cells cut a search to ~2 ms: 4 shards carry
 *   5,000 a second with the busiest ~94% busy; on a Friday night (one cell ~33% of searches) the
 *   city's shard is full and ~14% of searches fail; 16 shards stop the errors but the city's shard
 *   is still ~86% busy at 3x the bill. A cache of 5,000 cells answers 95% of Friday's searches and
 *   every shard is under 10% busy. A CDN answers 87% at the edge (median 44 -> 20 ms) for ~7x the
 *   bill, and with 10 s copies about half the searches miss a review written since.
 *
 * Pattern: spatial index (geohash cells), cache by cell, edge caching of rounded queries
 * Key insight: Nobody needs results for their exact coordinates. Round the location to a cell
 *   and the search becomes "what is in cell gcpuzg and its 8 neighbours", a key everyone nearby
 *   shares: a key you can shard by, cache and serve from the edge.
 * Tradeoffs: Sharding by cell keeps a search on one shard but puts a whole city on few shards;
 *   caching and the CDN serve answers a little old (fine for reviews, wrong for moving drivers).
 * Staff notes: Separate the place index (small, read-hot, rarely changed) from the reviews
 *   (large, written more). Pick the cell size from the search radius. Expect hot spots to move
 *   with the clock (lunch downtown, nights out elsewhere).
 * Interview signals: "design Yelp / nearby places", "find points within a radius", "geohash
 *   or quadtree", "read-heavy", "hot spot in a dense city".
 * Real world: Geohash-style cell ids are used by many geo indexes (Elasticsearch's geohash grid
 *   aggregation, Redis GEO stores a 52-bit geohash as a sorted-set score); Google's S2 and Uber's
 *   H3 are other cell systems built for the same job.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, cdn, invalidate, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: 5,000 requests a second, 99% of them searches and 1% a new
// place or review. A request's key is the geohash cell it is about. There are 50,000 cells with
// places in them, and their popularity is Zipf-shaped with skew 1.2: a few dense city cells get
// a large share of searches (the top cell about 20%).
const users = (o: { edge?: boolean } = {}) =>
  clients({
    to: o.edge ? "cdn" : "lb",
    qps: knob("qps", 5000, [10, 100_000]),
    mix: { read: 0.99, write: 0.01 },
    keys: 50_000,
    skew: knob("skew", 1.2, [0, 2]),
  });
// The app parses the search, computes the cell and its neighbours, and ranks the results: 1 ms.
const apps = (calls: Parameters<typeof server>[0]["calls"]) => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ label: "Search API", replicas: 4, cores: 4, serviceMs: { read: 1, write: 2, static: 1 }, calls }),
});

// @why Stage 1: places in one table with an index on latitude. "WHERE lat BETWEEN .. AND lng
// @why BETWEEN .." scans the whole latitude band and checks each row's longitude: 10 ms a search.
export const boxQuery = design("1. One database, a box query", {
  users: users(),
  ...apps(["db"]),
  db: database({ cores: 4, readMs: 10, writeMs: 5 }),
});

// @why Stage 2: each place is stored under its geohash (primitive 003). A search reads its cell
// @why and the 8 neighbours: a few short range scans, ~2 ms. Shards hold ranges of geohashes, so
// @why a cell and nearly all its neighbours share a shard. (The simulator picks a shard by hashing
// @why the cell; real range shards keep a whole city together, so its hot spot is worse.)
export const byCell = design("2. Geohash cells, sharded by cell", {
  users: users(),
  ...apps(["db"]),
  db: database({ cores: 4, readMs: 2, writeMs: 5, shards: knob("shards", 4, [1, 16]) }),
});

// @why Stage 3: the results for a cell are cached (cache-aside), kept at most 30 s. A new place or
// @why review is written to its shard and deletes that cell's cached copy, so the next search refills it.
export const cellCache = design("3. Cache each cell's results", {
  users: users(),
  ...apps({ read: [cacheAside("cache", "db")], write: ["db", invalidate("cache")] }),
  cache: cache({ capacity: knob("cacheCells", 5000, [0, 50_000]), ttlMs: 30_000 }),
  db: database({ cores: 4, readMs: 2, writeMs: 5, shards: 4 }),
});

// @why Stage 4: the app rounds the user's location to the cell before asking, so everyone in
// @why a cell sends the same URL and a CDN can keep the answer for 10 s. Writes pass through the
// @why CDN to the origin; the edge copies are not deleted, they just expire.
export const edge = design("4. Round to the cell, cache at the CDN", {
  users: users({ edge: true }),
  cdn: cdn({ to: "lb", capacity: knob("edgeCells", 20_000, [0, 50_000]), ttlMs: knob("edgeTtlMs", 10_000, [0, 60_000]) }),
  ...apps({ read: [cacheAside("cache", "db")], write: ["db", invalidate("cache")] }),
  cache: cache({ capacity: 5000, ttlMs: 30_000 }),
  db: database({ cores: 4, readMs: 2, writeMs: 5, shards: 4 }),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);
// Friday night downtown: the skew rises from 1.2 to 1.4 and the top cell's share from ~20% to ~33%.
const friday = { skew: 1.4 };

test("box query: 300 searches a second, the database 75% busy", () => {
  const s = summary(run(boxQuery, { ...S, knobs: { qps: 300 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db > 0.7 && s.util.db < 0.8, `db ${s.util.db}`);
});

test("broken: box query — 5,000 searches a second, and almost none succeed", () => {
  const r = run(boxQuery, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.98 && s.util.app < 0.05, `db ${s.util.db}, app ${s.util.app}`);
  // 4 cores / 10 ms = 400 searches a second reach the database; the rest are turned away.
  assert.ok(s.calls.db > 380 && s.calls.db < 430, `db answers ${s.calls.db}`);
  assert.ok(s.errorRate > 0.95, `errors ${s.errorRate}`);
});

test("geohash cells: four shards carry 5,000 searches a second", () => {
  const s = summary(run(byCell, S), 3);
  assert.equal(s.errorRate, 0);
  const [hot, ...rest] = sortDown(s.replicaUtil.db);
  assert.ok(hot > 0.88 && hot < 0.97, `busiest shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.7), `others ${rest}`);
  assert.ok(s.p50 > 45 && s.p50 < 50, `p50 ${s.p50}`);
  assert.ok(s.costPerHour > 2 && s.costPerHour < 2.15, `cost ${s.costPerHour}`);
});

test("broken: Friday night downtown — the city's shard is full while the others idle", () => {
  const r = run(byCell, { ...S, knobs: friday });
  const s = summary(r, 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.db);
  assert.ok(hot > 0.98, `hot shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.55), `others ${rest}`);
  // App workers wait on the full shard, so searches of quiet cells fail too.
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.1 && s.errorRate < 0.18, `errors ${s.errorRate}`);
});

test("sixteen shards: no errors, the city's shard still 86% busy, three times the bill", () => {
  const s = summary(run(byCell, { ...S, knobs: { ...friday, shards: 16 } }), 3);
  assert.equal(s.errorRate, 0);
  const sorted = sortDown(s.replicaUtil.db);
  assert.ok(sorted[0] > 0.8 && sorted[0] < 0.92, `hot shard ${sorted[0]}`);
  assert.ok(sorted[8] < 0.1, `median shard ${sorted[8]}`);
  assert.ok(s.costPerHour > 6 && s.costPerHour < 6.3, `cost ${s.costPerHour}`);
});

test("cell cache: on Friday night 95% of searches come from the cache", () => {
  const s = summary(run(cellCache, { ...S, knobs: friday }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.93, `hit ${s.hitRate.cache}`);
  assert.ok(s.replicaUtil.db.every((x) => x < 0.1), `shards ${s.replicaUtil.db}`);
  assert.ok(s.p50 > 42 && s.p50 < 46, `p50 ${s.p50}`);
  // Writes delete the cell's cached copy, so no search sees an old cell.
  assert.equal(s.staleRate, 0);
  assert.ok(s.costPerHour > 2.15 && s.costPerHour < 2.3, `cost ${s.costPerHour}`);
});

test("cell cache: a normal night, 89% hits and the busiest shard about 10% busy", () => {
  const s = summary(run(cellCache, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.86 && s.hitRate.cache < 0.92, `hit ${s.hitRate.cache}`);
  assert.ok(s.replicaUtil.db.every((x) => x < 0.12), `shards ${s.replicaUtil.db}`);
});

test("edge: the CDN answers 87% of searches and the median falls to 20 ms", () => {
  const s = summary(run(edge, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cdn > 0.84 && s.hitRate.cdn < 0.9, `edge hits ${s.hitRate.cdn}`);
  assert.ok(s.p50 < 22, `p50 ${s.p50}`);
  assert.ok(s.util.app < 0.06, `app ${s.util.app}`);
  assert.ok(s.calls.app > 600 && s.calls.app < 750, `origin ${s.calls.app}`);
  assert.ok(s.costPerHour > 15 && s.costPerHour < 16.5, `cost ${s.costPerHour}`);
});

test("broken: edge — copies kept 10 s, and half the searches miss a review just written", () => {
  const s = summary(run(edge, S), 3);
  assert.ok(s.staleRate > 0.45 && s.staleRate < 0.56, `stale ${s.staleRate}`);
});

test("edge with 1 s copies: a quarter stale, and the origin does twice the work", () => {
  const s = summary(run(edge, { ...S, knobs: { edgeTtlMs: 1000 } }), 3);
  assert.ok(s.staleRate > 0.2 && s.staleRate < 0.28, `stale ${s.staleRate}`);
  assert.ok(s.hitRate.cdn > 0.68 && s.hitRate.cdn < 0.75, `edge hits ${s.hitRate.cdn}`);
  assert.ok(s.calls.app > 1300 && s.calls.app < 1600, `origin ${s.calls.app}`);
});
