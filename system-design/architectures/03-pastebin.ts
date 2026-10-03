/**
 * 03. Pastebin
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Users upload text (a "paste", from a few lines to a megabyte) and get a link; anyone
 *   with the link can read it. Reads outnumber uploads about 9 to 1, a few pastes are read far
 *   more than the rest, and many pastes expire after a set time.
 *
 * Approach: Grow one bottleneck at a time
 *   1. The text lives in the database rows. 2. The text moves to object storage; the database
 *   keeps only small metadata rows. 3. A cache keeps popular pastes in memory. 4. Cleanup
 *   workers delete expired pastes in the background. Real systems find them with a periodic
 *   sweep over an expires_at index, a scheduler (e.g. a Redis sorted set by expiry time) or the
 *   object store's own lifecycle rules; common queues cannot hold a job back for an hour (Amazon
 *   SQS allows at most 15 minutes), so the simulation queues each delete at upload instead.
 *
 * Cost: text in the database ~360 requests a second (database full; 27% fail at 500); text in
 *   object storage: 1,000 a second with the database 29% busy, but the median request 93 ms
 *   instead of 56; a cache of the top 10% of pastes hits 80% and brings the median to 48 ms;
 *   cleanup of 100 expiring pastes a second needs about 5 workers busy (20 run 26% busy; with 4,
 *   the backlog passes 300 within 14 seconds and keeps growing).
 *
 * Pattern: separate metadata from blobs + cache-aside
 * Key insight: Big values and small values want different stores. A database is fast at finding
 *   small rows and slow at moving large ones; object storage holds any amount of bytes cheaply but
 *   answers slowly. Keep the small, searchable part in the database, the bytes in object storage,
 *   and the popular bytes in memory.
 * Tradeoffs: Two stores means two writes per upload that can half-fail, leaving orphan blobs or
 *   rows that point at nothing. Every uncached read pays object-storage latency. Physical
 *   deletion needs a cleanup process that can fall behind.
 * Staff notes: Write the blob first and the metadata row last, so a reader never sees a row
 *   without its blob; sweep orphan blobs later. Keep checking the metadata row on every read so
 *   deletion and expiry take effect at once for users, even for cached bodies. Then a cleanup
 *   backlog only delays physical deletion: storage keeps costing, and data kept past its
 *   retention period can break a legal or contractual promise. Watch the oldest job's age.
 * Interview signals: "design Pastebin / GitHub Gist", "where do large blobs go", "object storage
 *   vs database", "how do pastes expire", "cache large values".
 * Real world: Object stores such as Amazon S3, Google Cloud Storage and Azure Blob Storage hold
 *   files by key at low cost per gigabyte, with first-byte latencies of tens to a couple of
 *   hundred milliseconds for small objects (AWS cites roughly 100-200 ms for S3 Standard;
 *   single-digit milliseconds needs S3 Express One Zone).
 *   Storing large files there and a pointer in the database is the standard pattern.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: 100,000 pastes, 9 reads for every upload, popularity
// following a Zipf curve. The app spends 2 ms of CPU rendering a paste and 3 ms accepting one.
const users = (qps: number) => clients({ to: "lb", qps: knob("qps", qps, [10, 1_000_000]), mix: { read: 0.9, write: 0.1 } });
const lb = () => loadBalancer({ to: "app", healthCheckMs: 1000 });
const APP_MS = { read: 2, write: 3 };
const apps = (n: number, calls: Parameters<typeof server>[0]["calls"]) =>
  server({ replicas: knob("apps", n, [1, 20]), cores: 4, serviceMs: APP_MS, calls });
// A small metadata row: id, owner, size, created and expires-at, and where the text is stored.
const metadata = () => database({ cores: 4, readMs: 1, writeMs: 3 });
// Object storage is a service we call over the network: about 50 ms to fetch or store one paste.
const objectStorage = () => external({ label: "Object storage", latencyMs: 50, hopMs: 1 });

// @why Stage 1: the paste text is a column of its database row. Rows of tens of kilobytes make
// @why every read move a lot of bytes: 10 ms of database work to read a paste, 20 ms to store one.
export const blobsInDb = design("1. Paste text in the database", {
  users: users(250),
  lb: lb(),
  app: apps(2, ["db"]),
  db: database({ cores: 4, readMs: 10, writeMs: 20 }),
});

const split = (qps: number, name: string) =>
  design(name, {
    users: users(qps),
    lb: lb(),
    // @why Stage 2: an upload stores the text in object storage first, then writes the small metadata row. A read checks the row, then fetches the text.
    app: apps(4, { read: ["db", "blobs"], write: ["blobs", "db"] }),
    db: metadata(),
    blobs: objectStorage(),
  });
export const objectStore = split(1000, "2. Text in object storage, metadata in the database");

const cached = (name: string) =>
  design(name, {
    users: users(1000),
    lb: lb(),
    // @why Stage 3: a read still checks the metadata row (does it exist, has it expired), then looks for the text in the cache before object storage.
    app: apps(4, { read: ["db", cacheAside("cache", "blobs")], write: ["blobs", "db"] }),
    cache: cache({ capacity: knob("cacheKeys", 10_000, [0, 100_000]) }),
    db: metadata(),
    blobs: objectStorage(),
  });
export const withCache = cached("3. Cache popular pastes");

const expiring = (consumers: number, name: string) =>
  design(name, {
    users: users(1000),
    lb: lb(),
    // @why Stage 4: every upload also drops a "delete this paste when it expires" job on a queue.
    app: apps(4, { read: ["db", cacheAside("cache", "blobs")], write: ["blobs", "db", "expiry"] }),
    cache: cache({ capacity: knob("cacheKeys", 10_000, [0, 100_000]) }),
    db: metadata(),
    blobs: objectStorage(),
    // @why A cleanup worker deletes the text from object storage (waiting on it), then deletes the metadata row.
    expiry: queue({ label: "Expiry queue", consumers: knob("consumers", consumers, [1, 200]), workMs: 50, via: "blobs", to: "db" }),
  });
export const withExpiry = expiring(20, "4. Expire pastes from a queue");
// @why The same cleanup with too few workers for the deletes that arrive.
export const fewCleaners = expiring(4, "4. Too few cleanup workers");

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// Object storage becomes 10 times slower (500 ms a request) from 5 s to 10 s.
const slowStore = { seconds: 15, seed: 1, faults: [{ at: 5000, kind: "slow" as const, target: "blobs", factor: 10, durationMs: 5000 }] };

test("paste text in the database: 250 a second, the database two-thirds busy", () => {
  const s = summary(run(blobsInDb, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 50 && s.p50 < 60, `p50 ${s.p50}`);
  assert.ok(s.util.db > 0.55 && s.util.db < 0.75, `db ${s.util.db}`);
});

test("broken: paste text in the database — past about 360 a second it fails", () => {
  const r = run(blobsInDb, { ...S, knobs: { qps: 500 } });
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.95 && s.util.app < 0.15, `db ${s.util.db}, app ${s.util.app}`);
  assert.ok(s.ok > 340 && s.ok < 390, `served ${s.ok} a second`);
  assert.ok(s.errorRate > 0.2, `errors ${s.errorRate}`);
});

test("object storage: 1,000 a second, the database under a third busy, every read slower", () => {
  const before = summary(run(blobsInDb, S), 3);
  const after = summary(run(objectStore, S), 3);
  assert.equal(after.errorRate, 0);
  assert.ok(after.util.db < 0.33, `db ${after.util.db}`);
  assert.ok(after.p50 > before.p50 + 30 && after.p50 < 100, `p50 ${before.p50} -> ${after.p50}`);
  // App workers wait on object storage without using CPU.
  assert.ok(after.threads.app > 0.2 && after.threads.app < 0.35 && after.util.app < 0.2, `workers ${after.threads.app}, cpu ${after.util.app}`);
});

test("broken: object storage — a 10 times slower object store fails almost every request", () => {
  const r = run(objectStore, slowStore);
  assert.ok(summary(r, 1, 5).errorRate < 0.01);
  const s = summary(r, 6, 10);
  assert.ok(s.errorRate > 0.9, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95 && s.util.app < 0.2, `workers ${s.threads.app}, cpu ${s.util.app}`);
  assert.ok(summary(r, 11).errorRate < 0.01, "recovers when the object store does");
});

test("cache: popular pastes come from memory, at about half the latency", () => {
  const before = summary(run(objectStore, S), 3);
  const after = summary(run(withCache, S), 3);
  assert.equal(after.errorRate, 0);
  assert.ok(after.hitRate.cache > 0.75 && after.hitRate.cache < 0.85, `hit ${after.hitRate.cache}`);
  assert.ok(after.p50 < 50 && after.p50 < 0.6 * before.p50, `p50 ${before.p50} -> ${after.p50}`);
  assert.ok(after.p99 > 120, "a miss still pays for object storage");
});

test("broken: cache — a slow object store still stalls every uncached read", () => {
  const r = run(withCache, slowStore);
  const s = summary(r, 6, 10);
  assert.ok(s.p50 < 50, `p50 ${s.p50}: cached pastes are unaffected`);
  assert.ok(s.p99 > 800 && s.p99 < 1000, `p99 ${s.p99}: misses and uploads wait 500 ms or more`);
  assert.ok(s.errorRate > 0.01 && s.errorRate < 0.03, `errors ${s.errorRate}`);
});

test("expiry: 20 cleanup workers keep up with the deletes", () => {
  const s = summary(run(withExpiry, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.expiry > 0.2 && s.util.expiry < 0.35, `workers busy ${s.util.expiry}`);
  assert.ok(s.backlog.expiry < 20 && s.oldestMs.expiry < 200, `backlog ${s.backlog.expiry}, oldest ${s.oldestMs.expiry}`);
});

test("expiry: a slow object store delays deletes, and they catch up after", () => {
  const r = run(withExpiry, slowStore);
  const during = summary(r, 6, 10);
  // At 10 s, the end of the slowdown: about 250 jobs waiting, the oldest over 2 s old.
  assert.ok(during.backlog.expiry > 200 && during.backlog.expiry < 320 && during.oldestMs.expiry > 2000, `backlog ${during.backlog.expiry}, oldest ${during.oldestMs.expiry}`);
  const after = summary(r, 12);
  assert.ok(after.backlog.expiry < 20 && after.oldestMs.expiry < 200, `backlog ${after.backlog.expiry}, oldest ${after.oldestMs.expiry}`);
});

test("broken: too few cleanup workers — expired pastes are deleted later and later", () => {
  const r = run(fewCleaners, { seconds: 15, seed: 1 });
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0, "users see nothing wrong");
  assert.ok(s.util.expiry > 0.95, `workers busy ${s.util.expiry}`);
  const [early, at14, late] = [summary(r, 0, 5).backlog.expiry, summary(r, 0, 14).backlog.expiry, summary(r, 14).backlog.expiry];
  assert.ok(early > 120 && early < 170 && at14 > 300 && late > at14, `backlog ${early} at 5 s, ${at14} at 14 s, ${late} at 15 s: it keeps growing`);
  assert.ok(s.oldestMs.expiry > 3000, `oldest ${s.oldestMs.expiry}`);
});

test("cost: the final design costs more an hour, for four times the traffic", () => {
  const first = summary(run(blobsInDb, S), 3);
  const last = summary(run(withExpiry, S), 3);
  assert.ok(Math.abs(first.costPerHour - 0.71) < 0.02 && Math.abs(last.costPerHour - 1.28) < 0.02, `$${first.costPerHour} -> $${last.costPerHour} an hour`);
  assert.ok(last.costPerMillion < first.costPerMillion / 2, "per request it is cheaper");
});
