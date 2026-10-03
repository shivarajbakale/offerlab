/**
 * 20. Ticket Booking
 * Level: Staff
 * Group: Architectures
 *
 * Problem: People pick seats for concerts and games. A seat, once chosen, is held for a few
 *   minutes while they pay, then sold or released. No seat may ever be sold twice. On a big
 *   on-sale, one event gets three quarters of all traffic in the first minutes, bots included.
 *
 * Approach: One primary decides each event's seats; keep everything else off it
 *   1. One database: a hold is a conditional update of the seat row, and a delayed job releases
 *   it if it is not paid in time; the on-sale fills the database. 2. Shard by event: every seat
 *   of an event lives on one primary, so a hold never needs two machines; the on-sale event
 *   still fills its shard. 3. Serve the seat map from a cache for a second and rate-limit each
 *   user at the load balancer, so the hot shard only does holds.
 *
 * Cost: one 8-core database ~1,000 requests a second at 47% busy, full at the on-sale's 4,000;
 *   four shards carry 4,000 on a normal day but the on-sale event's shard is full; a 1 s
 *   seat-map cache and a per-user limit bring that shard to ~18% busy, with the bots' 30% of
 *   requests turned away.
 *
 * Pattern: conditional update (compare-and-set), delayed jobs for expiry, sharding by entity,
 *   short-TTL read cache, per-user rate limit
 * Key insight: Overselling is prevented by one place deciding: the seat's row on its event's one
 *   primary, changed only by "UPDATE ... WHERE seat is free", which the database runs atomically.
 *   Everything that only shows seats (maps, caches, replicas) may be stale, because a stale view
 *   can only cause a failed hold, never a double sale.
 * Tradeoffs: A cached seat map shows seats that were just taken, so some holds fail and the
 *   user must pick again. One event cannot be split across primaries without a cross-shard
 *   transaction. Expiry timers must not be what correctness depends on.
 * Staff notes: Make the hold check the expiry itself ("not sold, and free or held but expired"),
 *   so a late or lost release job never blocks a seat and a sold seat never matches. Make "pay"
 *   idempotent and conditional on the hold still being yours. For the biggest on-sales put a
 *   waiting room in front that admits people at the rate the hot shard can take.
 * Interview signals: "Ticketmaster", "book a seat", "reserve", "hold for 10 minutes", "oversell",
 *   "flash crowd", "hot event", "double booking".
 * Real world: Ticketmaster's Smart Queue and Cloudflare's Waiting Room admit visitors to a sale at
 *   a set rate. Seat holds with a time limit (often around 10 minutes) are the norm on ticketing
 *   sites.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cache, cacheAside, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// The key is the event: 1,000 events, Zipf-shaped popularity. A read loads an event's seat map
// (which seats are free); a write holds one seat. 30% of requests come from 20 bots. On a normal
// day (skew 1) the top event gets ~13% of requests; on its on-sale (skew 2.5) about 75%.
const fans = (o: { qps: number; skew: number }) =>
  clients({
    to: "lb",
    qps: knob("qps", o.qps, [10, 100_000]),
    mix: { read: 0.7, write: 0.3 },
    users: 20_000,
    keys: 1000,
    skew: o.skew,
    retry: "backoff",
    abuseShare: 0.3,
    abusers: 20,
  });
const app = (read: Parameters<typeof server>[0]["calls"], o: { limit?: boolean } = {}) => ({
  // Each user may send 2 requests a second, with a burst of 4; past that, 429 at once.
  lb: loadBalancer({ to: "app", ...(o.limit ? { rateLimit: { perSecond: 2, burst: 4 } } : {}) }),
  app: server({ replicas: 4, cores: 4, serviceMs: { read: 2, write: 1 }, calls: read }),
});
// The seats table, 8 cores. A seat map reads every seat's status for one event: 4 ms. A hold is
// "UPDATE seats SET holder = ?, until = now() + 10 min WHERE id = ? AND NOT sold AND (holder IS
// NULL OR until < now())" (a sold seat must never match), then a check that it changed one
// row: 2 ms. Different seats are different rows, so holds on one event do not queue behind each other's locks; they share the CPU.
const seats = (shards = 1) => database({ label: "Seats", cores: 8, readMs: 4, writeMs: 2, shards });
// Every hold schedules a release job, due when the hold expires: if the seat is still held by
// the same person and not paid, free it. Holds last 10 minutes in real life; 5 s here.
const expiry = () =>
  queue({ label: "Hold expiry (delayed)", consumers: 10, workMs: 1, to: "db", delayMs: knob("hold", 5000, [1000, 9000]) });

const booking = (name: string, o: { qps: number; skew: number; shards?: number }) =>
  design(name, {
    users: fans(o),
    ...app({ read: ["db"], write: ["db", "expiry"] }),
    db: seats(o.shards),
    expiry: expiry(),
  });

// @why Stage 1: one database holds every seat. A hold is a conditional update; a delayed job
// @why releases it if it was not paid in time.
export const oneDb = booking("1. One database, holds that expire", { qps: 1000, skew: 1 });
// @why The same database on the morning of a huge on-sale: 4,000 requests a second, 75% for one event.
export const oneDbOnSale = booking("1. One database, on-sale morning", { qps: 4000, skew: 2.5 });

// @why Stage 2: seats are sharded by event over four primaries. An event's seats all live on one
// @why primary, so a hold is still one conditional update on one machine.
export const sharded = booking("2. Shard by event", { qps: 4000, skew: 1, shards: 4 });
// @why The four shards on the on-sale morning: the event is one key, on one shard.
export const shardedOnSale = booking("2. Sharded, on-sale morning", { qps: 4000, skew: 2.5, shards: 4 });

// @why Stage 3: the seat map comes from a cache, refreshed at most once a second per event, and
// @why the load balancer limits each user to 2 requests a second. Holds still go to the shard.
export const protectedShard = design("3. Cache the seat map, limit each user", {
  users: fans({ qps: 4000, skew: 2.5 }),
  ...app({ read: [cacheAside("map", "db")], write: ["db", "expiry"] }, { limit: true }),
  map: cache({ label: "Seat-map cache", capacity: 1000, ttlMs: 1000 }),
  db: seats(4),
  expiry: expiry(),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// 4,000 requests a second; 6 seconds keep every simulated request a real one.
const BIG = { seconds: 6, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("one database: 1,000 a second, 47% busy, ~1,500 holds waiting to expire", () => {
  const s = summary(run(oneDb, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.db > 0.42 && s.util.db < 0.52, `db ${s.util.db}`);
  // ~300 holds a second, each with a release job due 5 s later.
  assert.ok(s.scheduled.expiry > 1300 && s.scheduled.expiry < 1700, `scheduled ${s.scheduled.expiry}`);
  assert.ok(s.backlog.expiry < 10, `due releases waiting ${s.backlog.expiry}`);
  assert.ok(Math.abs(s.costPerHour - 1.12) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: one database, on-sale morning — full, and the release jobs fall behind too", () => {
  const r = run(oneDbOnSale, BIG);
  const s = summary(r, 2);
  assert.equal(bottleneck(r, 2), "db");
  assert.ok(s.util.db > 0.98, `db ${s.util.db}`);
  assert.ok(s.errorRate > 0.3 && s.errorRate < 0.5, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  // Releases that are due but not done: those seats stay held past their expiry.
  assert.ok(s.backlog.expiry > 300, `due releases waiting ${s.backlog.expiry}`);
});

test("shards: four primaries by event carry 4,000 a second on a normal day", () => {
  const s = summary(run(sharded, BIG), 2);
  assert.equal(s.errorRate, 0);
  const u = s.replicaUtil.db;
  assert.equal(u.length, 4);
  assert.ok(u.every((x) => x > 0.3 && x < 0.65), `${u}`);
  assert.ok(Math.abs(s.costPerHour - 2.14) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: sharded, on-sale morning — the on-sale event's shard is full, the others idle", () => {
  const s = summary(run(shardedOnSale, BIG), 2);
  const [hot, ...rest] = sortDown(s.replicaUtil.db);
  assert.ok(hot > 0.98, `hot shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.25), `others ${rest}`);
  assert.ok(s.errorRate > 0.15 && s.errorRate < 0.3, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
});

test("protected: the on-sale with a cached seat map and a per-user limit, the hot shard 18% busy", () => {
  const s = summary(run(protectedShard, BIG), 2);
  const [hot] = sortDown(s.replicaUtil.db);
  assert.ok(hot > 0.14 && hot < 0.22, `hot shard ${hot}`);
  assert.ok(s.hitRate.map > 0.97, `hit ${s.hitRate.map}`);
  // Nearly all turned away are the bots' requests (30% of traffic); people get through.
  assert.ok(s.limitedRate > 0.25 && s.limitedRate < 0.31, `limited ${s.limitedRate}`);
  assert.ok(s.byClass.normal.errorRate < 0.01, `people ${s.byClass.normal.errorRate}`);
  assert.equal(s.timeoutRate, 0);
  // Most cached maps miss a hold made in the last second: some holds will find the seat taken.
  assert.ok(s.staleRate > 0.9, `stale ${s.staleRate}`);
  assert.ok(Math.abs(s.costPerHour - 2.29) < 0.02, `cost ${s.costPerHour}`);
  assert.ok(s.backlog.expiry < 10, `due releases waiting ${s.backlog.expiry}`);
});
