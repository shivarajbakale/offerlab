/**
 * 05. Bulkheads
 * Level: Senior
 * Group: Microservices
 *
 * Problem: One pool of app servers answers product pages (90% of traffic, fast, database only)
 *   and checkouts (10%, which also wait about 300 ms for an outside fraud-check service). When the
 *   fraud check gets slow, product pages fail too, though they never call it. How do we make sure
 *   one slow dependency can only use up its own share of the servers?
 *
 * Approach: Give each dependency its own worker limit
 *   1. One shared pool: checkouts waiting on the fraud check take every worker, and 95% of
 *   product pages fail. 2. A bulkhead: at most 20 workers per server may wait on the fraud check;
 *   a checkout over the limit fails at once. Product pages are untouched. 3. The bulkhead plus a 2
 *   s timeout: the stuck workers come back sooner, so checkouts recover within ~2 s of the fraud
 *   check instead of waiting for the slowest calls to finish.
 *
 * Cost: no extra machines or network hops: a counter per dependency on each server. While the
 *   fraud check is slow, checkouts fail (fast) instead of everything failing (slowly).
 *
 * Pattern: bulkhead (per-dependency concurrency limit), fail fast
 * Key insight: Workers are the shared resource that lets one slow dependency hurt unrelated
 *   requests. A bulkhead caps how many workers each dependency can hold, so a stuck dependency
 *   uses up only its own compartment. Size it from Little's law: normal call rate x p99 latency,
 *   plus headroom (rate x mean latency is only the floor).
 * Tradeoffs: A limit too small refuses work on a normal day (bursts, a slow tail); too large and
 *   it protects nothing. Without a timeout, a full compartment stays full until its slowest call
 *   returns. Calls refused by the bulkhead are failures the user sees.
 * Staff notes: Put bulkheads on every dependency whose latency you do not control, and size them
 *   from measured rate x p99 latency. Alert on "pool full" refusals: they are the earliest sign a
 *   dependency is in trouble. A bulkhead and a circuit breaker work together: the bulkhead bounds
 *   how many workers wait, the breaker stops sending calls at all.
 * Interview signals: "one dependency took down the whole service", "thread pool per
 *   dependency", "isolation", "noisy neighbour", "blast radius".
 * Real world: Netflix's Hystrix ran each dependency's calls in its own thread pool or behind a
 *   semaphore limit; resilience4j offers the same as Bulkhead. The name comes from ships: walls
 *   that split the hull into compartments, so one leak floods one compartment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { call, clients, database, design, external, knob, loadBalancer, run, server, summary, type CallStep } from "../traffic/index.ts";

// 1,000 requests a second: 900 product pages ("read") and 100 checkouts ("write").
// Users wait up to 1 s for a page and 5 s for a checkout.
const users = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 2000]), mix: { read: 0.9, write: 0.1 }, hopMs: 1, timeoutMs: { read: 1000, write: 5000 } });
// 4 app servers x 50 workers = 200. A page reads the database; a checkout writes it, then waits for the fraud check.
const shop = (fraud: CallStep, pools?: Record<string, number>) =>
  server({ label: "Shop", replicas: 4, cores: 4, serviceMs: { read: 4, write: 4 }, calls: { read: ["db"], write: ["db", fraud] }, hopMs: 0.5, ...(pools ? { pools } : {}) });
// An outside fraud-scoring service: about 300 ms an answer, 10 ms away. Its capacity is not our problem; its speed is.
const fraud = () => external({ label: "Fraud check", latencyMs: 300, hopMs: 10 });
const db = () => database({ cores: 8, readMs: 1, writeMs: 3, hopMs: 1 });

// @why Stage 1: every request shares the same 50 workers per server, whatever it waits on.
export const sharedPool = design("1. One shared pool", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: shop("fraud"),
  fraud: fraud(),
  db: db(),
});

// @why Stage 2: a bulkhead. At most 20 of each server's 50 workers may wait on the fraud check;
// @why the 21st checkout is refused at once. Normal need: 25 checkouts/s per server x 0.3 s = ~8.
export const bulkhead = design("2. A bulkhead for the fraud check", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: shop("fraud", { fraud: 20 }),
  fraud: fraud(),
  db: db(),
});

// @why Stage 3: the same bulkhead, and give up on a fraud check after 2 s, so a stuck
// @why compartment empties within 2 s instead of waiting for its slowest call.
export const bulkheadAndTimeout = design("3. Bulkhead plus a timeout", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: shop(call("fraud", { timeoutMs: 2000 }), { fraud: 20 }),
  fraud: fraud(),
  db: db(),
});

// --- helpers for the scenarios ---

const S = { seconds: 20, seed: 1 };
// The fraud check answers 30 times slower, about 9 s, from 5 s to 13 s. Calls that start in
// that window stay slow even after it ends.
const slowFraud = [{ at: 5000, kind: "slow" as const, target: "fraud", factor: 30, durationMs: 8000 }];
const during = (r: ReturnType<typeof run>) => summary(r, 7, 13);

test("broken: one shared pool — a slow fraud check fails product pages too", () => {
  const r = run(sharedPool, { ...S, faults: slowFraud });
  const before = summary(r, 2, 5);
  assert.equal(before.errorRate, 0);
  assert.ok(before.byKind.read!.p99 > 14 && before.byKind.read!.p99 < 22, `page p99 before ${before.byKind.read!.p99}`);
  assert.ok(before.byKind.read!.p50 > 9 && before.byKind.read!.p50 < 13, `page p50 before ${before.byKind.read!.p50}`);
  const s = during(r);
  // Pages never call the fraud check, and 95% of them fail.
  assert.ok(s.byKind.read!.errorRate > 0.9 && s.byKind.read!.errorRate < 0.99, `page errors ${s.byKind.read!.errorRate}`);
  assert.ok(s.threads.app > 0.98 && s.util.app > 0.02 && s.util.app < 0.06, `workers ${s.threads.app}, cpu ${s.util.app}`);
});

test("bulkhead: product pages stay healthy while checkouts fail fast", () => {
  const r = run(bulkhead, { ...S, faults: slowFraud });
  const s = during(r);
  // Pages: no errors, and the same latency as on a normal day.
  assert.equal(s.byKind.read!.errorRate, 0);
  assert.ok(s.byKind.read!.p50 < 12 && s.byKind.read!.p99 < 25, `page p50 ${s.byKind.read!.p50} p99 ${s.byKind.read!.p99}`);
  // Only 80 workers (20 per server) can wait on the fraud check; workers are well under half used.
  assert.ok(s.threads.app > 0.35 && s.threads.app < 0.5, `workers ${s.threads.app}`);
  // Nearly every checkout is refused at once by the full compartment.
  assert.ok(s.byKind.write!.errorRate > 0.9, `checkout errors ${s.byKind.write!.errorRate}`);
  assert.ok(s.links["app>fraud"].poolFull > 85 && s.links["app>fraud"].poolFull < 100, `pool full ${s.links["app>fraud"].poolFull}`);
  // The fraud check recovered at 13 s, but checkouts that started just before are still stuck,
  // holding the compartment: many checkouts are still refused from 14 s to 16 s.
  assert.ok(summary(r, 14, 16).byKind.write!.errorRate > 0.45 && summary(r, 14, 16).byKind.write!.errorRate < 0.75, `checkout errors 14-16 s ${summary(r, 14, 16).byKind.write!.errorRate}`);
});

test("bulkhead and timeout: checkouts come back within about 2 s of the fraud check", () => {
  const r = run(bulkheadAndTimeout, { ...S, faults: slowFraud });
  const s = during(r);
  assert.equal(s.byKind.read!.errorRate, 0);
  assert.ok(s.byKind.read!.p99 < 25, `page p99 ${s.byKind.read!.p99}`);
  assert.equal(s.byKind.write!.errorRate, 1);
  // Stuck calls give their workers back after 2 s, so the compartment is empty again by 15 s.
  const after = summary(r, 15.5, 20);
  assert.equal(after.errorRate, 0);
  assert.ok(after.byKind.write!.p50 > 250 && after.byKind.write!.p50 < 350, `checkout p50 ${after.byKind.write!.p50}`);
});
