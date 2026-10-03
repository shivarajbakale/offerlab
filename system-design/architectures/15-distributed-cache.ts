/**
 * 15. Distributed Cache
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Reads outnumber what the database can serve, so popular records are kept in memory
 *   on a tier of cache servers. With several cache servers, every app server must agree which
 *   one holds each key. Servers are added, die and restart, and the database must survive the
 *   misses that follow. One very popular key can still overload the one server that holds it.
 *
 * Approach: Spread keys so that changes move few of them; protect the database and the hot keys
 *   1. Every read goes to the database. 2. A tier of cache servers, a key's server chosen by
 *   hash(key) mod N. Adding a fifth server moves about 80% of keys: they all miss at once and
 *   the database is flooded (a stampede). 3. Consistent hashing: the new server takes only its
 *   share, about a fifth; TTLs bound how stale a copy can be, at the price of more misses.
 *   4. A hot key fills its cache server; a small, short-lived copy inside each app server
 *   (a local cache) takes it off the tier.
 *
 * Cost: the database alone serves ~3,500 reads a second (9,500 arrive). Four 1-core cache
 *   servers answer ~90% of reads and leave the database ~30% busy, for ~$1.65 an hour. Moving
 *   80% of keys at once fills the database for seconds (a quarter of requests fail at first);
 *   moving a fifth raises it to ~57%, with no errors. A 10 s TTL drops the hit rate to ~70%.
 *   A viral record fills its cache server while the others are under 45% busy; a 1-second
 *   local copy in each app server brings every cache server under 10%, but when the popular
 *   records also change often, ~70% of reads return an out-of-date copy.
 *
 * Pattern: cache-aside, consistent hashing, local (near) cache, TTL
 * Key insight: A cache tier is only as good as its hit rate on its worst day: after a restart,
 *   a rehash or a node loss, the misses all land on the database at once. Choose key placement
 *   so a change moves as few keys as possible, and keep the database able to survive the
 *   misses you will cause.
 * Tradeoffs: Consistent hashing needs a shared, versioned view of the ring. Local caches put
 *   copies everywhere that writes cannot reach quickly, so they must be short-lived, and their
 *   data a little stale. TTLs trade freshness for misses.
 * Staff notes: Alert on hit rate and on database load together; a falling hit rate is the
 *   warning before the outage. Never restart or resize a whole cache tier at once: one node at
 *   a time, waiting for the hit rate to recover. Add jitter to TTLs so keys filled together do
 *   not expire together. Coalesce misses (one fetch per key, others wait for it).
 * Interview signals: "design a distributed cache", "Memcached / Redis cluster", "cache
 *   stampede / thundering herd", "hot key", "consistent hashing", "cache invalidation", "TTL".
 * Real world: Memcached clients commonly use consistent hashing (the ketama scheme) to pick a
 *   server. Redis Cluster splits keys into 16,384 hash slots that are moved between nodes.
 *   Facebook's "Scaling Memcache at Facebook" (NSDI 2013) describes leases against stampedes
 *   and stale sets, and a cold-cluster warm-up that reads from a warm cluster.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, cdn, clients, database, design, invalidate, knob, loadBalancer, run, server, summary, type CallStep } from "../traffic/index.ts";

// 10,000 requests a second: 95% reads, 5% writes, over 100,000 records with Zipf popularity
// (skew 1: the most popular record gets about 8% of reads). Measured from our edge, 1 ms away.
const users = (skew = 1, write = 0.05) =>
  clients({ to: "lb", qps: knob("qps", 10_000, [500, 40_000]), mix: { read: 1 - write, write }, skew: knob("skew", skew, [0.5, 2]), hopMs: 1 });
// The database: 8 cores, 2 ms a read or a write. Writes use about one core; the rest serve ~3,500 reads a second.
const db = () => database({ cores: 8, readMs: 2, writeMs: 2, connections: 200 });
const app = (calls: { read: CallStep[]; write: CallStep[] }) => server({ replicas: 4, cores: 4, serviceMs: { read: 0.5, write: 1 }, calls });

// @why Stage 1: no cache. Every read is a database query.
export const noCache = design("1. Every read goes to the database", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: app({ read: ["db"], write: ["db"] }),
  db: db(),
});

// A cache server: one core (Redis runs commands on one thread), 0.25 ms a lookup, so about
// 4,000 lookups a second, holding up to 50,000 records. It starts warm with the most popular ones.
// A read asks the cache first and, on a miss, reads the database and stores the answer (cache-aside).
// A write updates the database, then deletes the cached copy.
const tier = (servers: number, ttlMs = 0) =>
  cache({ label: "Cache servers", replicas: servers, cores: 1, capacity: 50_000, serviceMs: { read: 0.25, write: 0.25 }, ttlMs: knob("ttlMs", ttlMs, [0, 60_000]) });
const cachedApp = () => app({ read: [cacheAside("cache", "db")], write: ["db", invalidate("cache")] });
const cached = (name: string, servers: number, skew = 1, ttlMs = 0, write = 0.05) =>
  design(name, {
    users: users(skew, write),
    lb: loadBalancer({ to: "app" }),
    app: cachedApp(),
    cache: tier(servers, ttlMs),
    db: db(),
  });

// @why Stage 2: four cache servers. A key lives on server hash(key) mod 4: every app server
// @why computes the same answer, so they all look in the same place.
export const modN = cached("2. Four cache servers, hash mod N", 4);

// @why Stage 2, adding a fifth server. With mod N, a key stays put only if hash mod 4 equals
// @why hash mod 5: one key in five. The other 80% now map to a server that does not have them.
// @why The simulator always places keys by hash mod N, so a rehash is modelled as the same
// @why five servers with four of them emptied: 80% of the keys gone from where reads look.
export const fiveServers = cached("2. A fifth server, hash mod N", 5);

// @why Stage 3: consistent hashing. Keys and servers sit on a ring; a key belongs to the next
// @why server clockwise. A new server takes over only the keys just before its points on the
// @why ring, about a fifth of them; every other key stays. Modelled as five servers with only the
// @why new one empty.
export const ring = cached("3. Consistent hashing: a fifth server", 5);
// @why The ring with a 10-second TTL on every entry: a copy is never more than 10 s old, so a
// @why missed invalidation heals itself, but every key is fetched again 10 s after it was filled.
// @why (Runs here last seconds, so the TTL is seconds; real TTLs are often minutes or hours.)
export const ringTtl = cached("3. With a 10-second TTL", 5, 1, 10_000);

// @why Stage 4: one record goes viral (skew 1.5): it gets about 38% of all reads, and all of them
// @why go to the one cache server that holds it. Today's traffic is reads: nobody is changing it.
export const hotKey = cached("4. A hot key", 5, 1.5, 0, 0);

// @why Stage 4: each app server keeps a small local copy of the 1,000 records it reads most,
// @why for at most 1 second. Repeated reads of the hot key are answered without leaving the
// @why app server. The simulator draws this local cache as its own box in front of the app
// @why servers (one per app server); in a real system it is a map in each app server's memory.
const withLocal = (name: string, write: number) =>
  design(name, {
    users: users(1.5, write),
    lb: loadBalancer({ to: "local" }),
    local: cdn({ label: "Local cache (in each app server)", to: "app", replicas: 4, cores: 4, capacity: 1000, ttlMs: 1000, hopMs: 0.1, costPerMillion: 0 }),
    app: cachedApp(),
    cache: tier(5),
    db: db(),
  });
export const localCache = withLocal("4. A local cache in each app server", 0);
// @why The same local cache when 5% of requests are writes, skewed like the reads: the hot record
// @why changes about 190 times a second. A write deletes the copy on the cache servers, but
// @why nothing reaches the local copies, which live on for up to 1 s.
export const localCacheWrites = withLocal("4. A local cache on a record that keeps changing", 0.05);

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);
// The change happens at 4 s: these servers lose everything they held.
const emptied = (targets: string[]) => targets.map((target) => ({ at: 4000, kind: "restart" as const, target }));

test("broken: no cache — 9,500 reads a second for a database that serves 3,500", () => {
  const r = run(noCache, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.98 && s.util.app < 0.2, `db ${s.util.db}, app ${s.util.app}`);
  assert.ok(s.errorRate > 0.5 && s.errorRate < 0.7, `errors ${s.errorRate}`);
});

test("mod N: four cache servers answer about 90% of reads", () => {
  const s = summary(run(modN, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.88 && s.hitRate.cache < 0.94, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db > 0.25 && s.util.db < 0.4, `db ${s.util.db}`);
  assert.ok(s.replicaUtil.cache.every((x) => x > 0.5 && x < 0.8), `cache servers ${s.replicaUtil.cache}`);
  assert.ok(s.p50 < 9, `p50 ${s.p50}`);
  assert.ok(Math.abs(s.costPerHour - 1.65) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: a fifth server with mod N — 80% of keys move, and the database is flooded", () => {
  const r = run(fiveServers, { ...S, faults: emptied(["cache-1", "cache-2", "cache-3", "cache-4"]) });
  assert.equal(summary(r, 2, 4).errorRate, 0);
  const first = summary(r, 4, 5);
  assert.ok(first.hitRate.cache < 0.55, `hit ${first.hitRate.cache}`);
  assert.ok(first.util.db > 0.98, `db ${first.util.db}`);
  assert.ok(first.errorRate > 0.2 && first.errorRate < 0.3, `errors ${first.errorRate}`);
  assert.ok(first.p50 > 60, `p50 ${first.p50}`);
  // Each answered miss refills the cache, so it recovers, slowly: the database is still full 3 s later.
  const later = summary(r, 6, 8);
  assert.ok(later.util.db > 0.98 && later.errorRate > 0.03, `db ${later.util.db}, errors ${later.errorRate}`);
  assert.ok(summary(r, 8, 10).errorRate < 0.02, `errors at the end ${summary(r, 8, 10).errorRate}`);
});

test("ring: a fifth server takes only its share", () => {
  const r = run(ring, { ...S, faults: emptied(["cache-5"]) });
  const first = summary(r, 4, 5);
  assert.equal(summary(r, 4, 10).errorRate, 0);
  assert.ok(first.hitRate.cache > 0.75 && first.hitRate.cache < 0.85, `hit ${first.hitRate.cache}`);
  assert.ok(first.util.db > 0.5 && first.util.db < 0.65, `db ${first.util.db}`);
  assert.ok(first.p50 < 9, `p50 ${first.p50}`);
});

test("ttl: a 10-second TTL — every copy at most 10 s old, and far more misses", () => {
  const s = summary(run(ringTtl, S), 3);
  assert.equal(s.errorRate, 0);
  // Without a TTL the same design hits ~91% with the database ~33% busy.
  assert.ok(s.hitRate.cache > 0.65 && s.hitRate.cache < 0.75, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db > 0.75 && s.util.db < 0.9, `db ${s.util.db}`);
});

test("broken: a hot key — one cache server full, the rest idle", () => {
  const s = summary(run(hotKey, S), 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.cache);
  assert.ok(hot > 0.98, `hot server ${hot}`);
  assert.ok(rest.every((x) => x < 0.45), `others ${rest}`);
  // The database is idle: every read is a hit. The app servers' workers all wait on one cache server.
  assert.ok(s.util.db < 0.05, `db ${s.util.db}`);
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.2 && s.errorRate < 0.33, `errors ${s.errorRate}`);
});

test("local cache: the hot key served inside each app server", () => {
  const s = summary(run(localCache, S), 3);
  assert.equal(s.errorRate, 0);
  assert.equal(s.staleRate, 0);
  assert.ok(s.hitRate.local > 0.8 && s.hitRate.local < 0.9, `local hit ${s.hitRate.local}`);
  assert.ok(s.replicaUtil.cache.every((x) => x < 0.1), `cache servers ${s.replicaUtil.cache}`);
  assert.ok(s.p50 < 4, `p50 ${s.p50}`);
  assert.ok(Math.abs(s.costPerHour - 1.8) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: a local cache on a record that keeps changing — most reads are stale", () => {
  const s = summary(run(localCacheWrites, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.staleRate > 0.6 && s.staleRate < 0.8, `stale ${s.staleRate}`);
});
