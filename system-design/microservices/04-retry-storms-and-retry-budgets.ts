/**
 * 04. Retry Storms and Retry Budgets
 * Level: Staff
 * Group: Microservices
 *
 * Problem: A request goes from the user's app to a gateway, to an Orders service, to a database.
 *   Each layer retries a failed call up to 3 times, which seems prudent. Then the database has a
 *   3-second slow spell. Why does the whole system stay down long after the database is fine
 *   again, and what kind of retrying lets it recover?
 *
 * Approach: Retry at one layer, and only within a budget
 *   1. Retry at every layer: 3 x 3 x 3 = up to 27 database attempts per click; after the slow
 *   spell the database gets ~24 times its normal load and never recovers. 2. Retry at one layer
 *   (Orders, 3 attempts): up to 3x, still more than the database can do, so still stuck.
 *   3. Retries only up to 10% of first attempts (a retry budget), with exponential backoff and
 *   jitter: extra load stays near 1.6x even mid-spell, and the system is back to normal within
 *   2 s of the database. 4. Add a short database queue (load shedding): refuse a query at once
 *   rather than let it wait past Orders' timeout, and ~40% fail during the spell instead of ~90%.
 *
 * Cost: retries do not save requests during the slow spell itself: ~90% fail with every layer
 *   retrying, with a budget, and with no retries at all. The database still runs ~625 queries a
 *   second, but its queue grows until every query waits past Orders' 150 ms timeout. Retries decide
 *   whether the system comes back: with every layer retrying, 100% still fail 8 s after the database
 *   recovered; with a budget, none do. Bounding the queue is what saves requests during the spell.
 *
 * Pattern: retry budget, exponential backoff with jitter, retry at a single layer, load shedding (bounded queue)
 * Key insight: A retry is extra load sent exactly when a service is struggling. Retries at
 *   several layers multiply. Once the extra load pushes a service past its capacity, it stays
 *   there by itself: calls queue past their timeouts, time out, and are retried, so the trigger
 *   can go away and the overload remains (a metastable failure). A budget caps the extra load
 *   at a fixed share, whatever is happening. An unbounded queue is the other half: it lets a service
 *   finish work for callers that have already left; a short one refuses that work instead.
 * Tradeoffs: A budget gives up on some requests a retry would have saved during a blip.
 *   Backoff makes recovered requests slower. Picking the one layer to retry needs agreement
 *   across teams.
 * Staff notes: Ask "what is the worst-case number of attempts at the bottom of this call chain?"
 *   in every design review; multiply the attempts at each layer. Retry only at one layer
 *   (usually the one closest to the failure), cap with a budget (Finagle's retry budgets work this
 *   way; gRPC's retry throttling is a related built-in throttle), bound queues to about a timeout's
 *   worth of work, and never retry errors that mean "overloaded, back
 *   off" without backoff. Primitive 015 (Retry with Exponential Backoff and Jitter) covers the
 *   timing itself.
 * Interview signals: "the outage was 30 s but we were down for an hour", "thundering herd",
 *   "everything retries", "metastable failure", "the database could not come back up".
 * Real world: "Metastable Failures in Distributed Systems" (Bronson et al., HotOS 2021) names
 *   this pattern, with retries as a classic way to sustain it. The Google SRE book's chapters on
 *   handling overload and cascading failures advise against retrying at several layers and
 *   recommend capping retries with a per-client budget (10% of requests in its example).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { call, clients, database, design, knob, loadBalancer, run, server, summary, type ClientsSpec } from "../traffic/index.ts";

// 1,000 requests a second. The user's app gives up after 1 s.
const users = (retry: Partial<ClientsSpec>) =>
  clients({ to: "lb", qps: knob("qps", 1000, [10, 2000]), mix: { read: 0.9, write: 0.1 }, hopMs: 1, timeoutMs: 1000, attempts: 3, ...retry });
// The gateway checks the request and passes it to Orders, waiting at most 500 ms.
const gateway = (retries: number) =>
  server({ label: "Gateway", replicas: 4, cores: 4, threads: 200, serviceMs: { read: 0.5, write: 0.5 }, calls: [call("orders", { timeoutMs: 500, ...(retries > 1 ? { retry: { attempts: retries } } : {}) })], hopMs: 0.5 });
// Orders does 2 ms of work and one database query, waiting at most 150 ms for it.
const orders = (dbCall: ReturnType<typeof call>) =>
  server({ label: "Orders", replicas: 4, cores: 4, threads: 200, serviceMs: { read: 2, write: 2 }, calls: [dbCall], hopMs: 0.5 });
// 8 cores, 3 ms a read and 5 ms a write: room for about 2,500 queries a second. Normally 40% busy.
// Up to 1,000 queries may wait for one of its 40 connections (the default), unless `queue` says otherwise.
const db = (queue?: number) => database({ cores: 8, readMs: 3, writeMs: 5, hopMs: 1, connections: 40, ...(queue !== undefined ? { queue } : {}) });

// @why For comparison: nobody retries at all. The slow spell still fails about 90% of requests,
// @why so retries are not what fails them.
export const noRetries = design("1. No retries at all", {
  users: users({ retry: "none" }),
  lb: loadBalancer({ to: "gw" }),
  gw: gateway(1),
  orders: orders(call("db", { timeoutMs: 150 })),
  db: db(),
});

// @why Stage 1: every layer retries up to 3 attempts, at once. One click can become 3 gateway
// @why calls, 9 Orders calls and 27 database queries.
export const retryEverywhere = design("1. Retry at every layer", {
  users: users({ retry: "immediate" }),
  lb: loadBalancer({ to: "gw" }),
  gw: gateway(3),
  orders: orders(call("db", { timeoutMs: 150, retry: { attempts: 3 } })),
  db: db(),
});

// @why Stage 2: only Orders retries (the layer next to the database), 3 attempts, at once.
// @why At most 3 queries per click.
export const retryOneLayer = design("2. Retry at one layer", {
  users: users({ retry: "none" }),
  lb: loadBalancer({ to: "gw" }),
  gw: gateway(1),
  orders: orders(call("db", { timeoutMs: 150, retry: { attempts: 3 } })),
  db: db(),
});

// @why Stage 3: Orders retries at most 10% as many queries as it sends first tries (over the
// @why last 10 s, per Orders server), waiting 50 ms, then 100 ms, each times a random factor
// @why from 0 to 2 (jitter). The user's app also backs off (100 ms, then 200 ms, with jitter)
// @why and retries at most 10% of its requests.
export const retryBudget = design("3. Retry budget, backoff and jitter", {
  users: users({ retry: "backoff", retryBudget: 0.1 }),
  lb: loadBalancer({ to: "gw" }),
  gw: gateway(1),
  orders: orders(call("db", { timeoutMs: 150, retry: { attempts: 3, backoffMs: 50, jitter: 1 }, retryBudget: 0.1 })),
  db: db(),
});

// @why Stage 4: the same budget, and the database lets at most 20 queries wait for a connection.
// @why One more is refused at once (load shedding). With 40 running and 20 waiting, a query
// @why waits about 60 / 625 s, roughly 100 ms, even mid-spell: inside Orders' 150 ms timeout.
export const shortQueue = design("4. Budget plus a short database queue (load shedding)", {
  users: users({ retry: "backoff", retryBudget: 0.1 }),
  lb: loadBalancer({ to: "gw" }),
  gw: gateway(1),
  orders: orders(call("db", { timeoutMs: 150, retry: { attempts: 3, backoffMs: 50, jitter: 1 }, retryBudget: 0.1 })),
  db: db(20),
});

// --- helpers for the scenarios ---

// Each simulated request stands for 4 real ones (machines keep a quarter of their cores and
// workers, so every rate and share is the same); it keeps the retry storm inside the event limit.
const S = { seconds: 16, seed: 1, scale: 4 };
// The database runs 4 times slower from 5 s to 8 s (a backup, a bad query plan, a failover):
// it can do about 625 queries a second instead of 2,500.
const slowDb = [{ at: 5000, kind: "slow" as const, target: "db", factor: 4, durationMs: 3000 }];

test("broken: retry at every layer — the database never recovers", () => {
  const r = run(retryEverywhere, { ...S, faults: slowDb });
  const before = summary(r, 1, 5);
  assert.equal(before.errorRate, 0);
  assert.ok(before.calls.db > 900 && before.calls.db < 1100, `db calls before ${before.calls.db}`);
  assert.ok(before.util.db > 0.35 && before.util.db < 0.45, `db cpu before ${before.util.db}`);
  // During the slow spell about 90% fail, as they do with no retries at all.
  assert.ok(summary(r, 5, 8).errorRate > 0.85 && summary(r, 5, 8).errorRate < 0.96, `errors during ${summary(r, 5, 8).errorRate}`);
  // The database has been fine since 8 s, and every request still fails: it is buried in retries.
  const after = summary(r, 10, 16);
  assert.ok(after.errorRate > 0.99, `errors after ${after.errorRate}`);
  assert.ok(after.calls.db > 20_000 && after.calls.db < 27_000, `db calls after ${after.calls.db}`);
  assert.ok(after.util.db > 0.99, `db cpu after ${after.util.db}`);
  // Most of that is retries from Orders and the gateway.
  assert.ok(after.serviceRetries > 18_000 && after.serviceRetries < 24_000,`service retries ${after.serviceRetries}`);
  // `wasted` counts, over the window (6 s), answers that arrived after their caller gave up:
  // about 2,500 a second, nearly all the database can do.
  assert.ok(after.wasted / 6 > 2000 && after.wasted / 6 < 2700, `wasted a second ${after.wasted / 6}`);
});

test("broken: no retries at all — the slow spell still fails about 90% of requests", () => {
  const r = run(noRetries, { ...S, faults: slowDb });
  assert.equal(summary(r, 1, 5).errorRate, 0);
  const during = summary(r, 5, 8);
  assert.ok(during.errorRate > 0.88 && during.errorRate < 0.96, `errors during ${during.errorRate}`);
  // From 6 s every request fails: the queue holds more than 150 ms of work.
  assert.ok(summary(r, 6, 8).errorRate > 0.99, `errors 6-8 s ${summary(r, 6, 8).errorRate}`);
  // The database is flat out and still finishes about 550 queries a second, too late for anyone.
  assert.ok(during.util.db > 0.99, `db cpu during ${during.util.db}`);
  assert.ok(during.wasted / 3 > 450 && during.wasted / 3 < 650, `wasted a second ${during.wasted / 3}`);
  // Nothing keeps it overloaded: back to normal right after the database.
  assert.equal(summary(r, 10, 16).errorRate, 0);
});

test("broken: retry at one layer — 3 attempts is still too many", () => {
  const r = run(retryOneLayer, { ...S, faults: slowDb });
  assert.equal(summary(r, 1, 5).errorRate, 0);
  const after = summary(r, 10, 16);
  assert.ok(after.errorRate > 0.99, `errors after ${after.errorRate}`);
  // About 3 queries per request: 3,000 a second against room for 2,500.
  assert.ok(after.calls.db > 2700 && after.calls.db < 3300, `db calls after ${after.calls.db}`);
  assert.ok(after.util.db > 0.99, `db cpu after ${after.util.db}`);
});

test("budget: retries capped at 10% — back to normal right after the database", () => {
  const r = run(retryBudget, { ...S, faults: slowDb });
  assert.ok(summary(r, 5, 8).errorRate > 0.85 && summary(r, 5, 8).errorRate < 0.96, `errors during ${summary(r, 5, 8).errorRate}`);
  // During the slow spell the extra load stays bounded: about 1.6x (a 10 s budget can be spent
  // in a burst), not 3x or 24x.
  const during = summary(r, 5, 8);
  assert.ok(during.calls.db > 1300 && during.calls.db < 1800, `db calls during ${during.calls.db}`);
  const after = summary(r, 10, 16);
  assert.equal(after.errorRate, 0);
  assert.ok(after.calls.db > 900 && after.calls.db < 1100, `db calls after ${after.calls.db}`);
  assert.ok(after.util.db > 0.33 && after.util.db < 0.45, `db cpu after ${after.util.db}`);
  assert.equal(after.serviceRetries, 0);
  assert.ok(after.p50 > 11 && after.p50 < 14, `p50 after ${after.p50}`);
});

test("short queue: a bounded queue saves most requests during the spell", () => {
  const r = run(shortQueue, { ...S, faults: slowDb });
  assert.equal(summary(r, 1, 5).errorRate, 0);
  // About 40% fail instead of 90%. The database can run about 625 of the 1,000 a second, so at
  // least 37.5% must fail; nearly all the rest are answered in time.
  const during = summary(r, 5, 8);
  assert.ok(during.errorRate > 0.35 && during.errorRate < 0.45, `errors during ${during.errorRate}`);
  // Almost no wasted work: a refused query costs the database nothing.
  assert.ok(during.wasted / 3 < 10, `wasted a second ${during.wasted / 3}`);
  assert.ok(during.util.db > 0.99, `db cpu during ${during.util.db}`);
  assert.equal(summary(r, 10, 16).errorRate, 0);
});
