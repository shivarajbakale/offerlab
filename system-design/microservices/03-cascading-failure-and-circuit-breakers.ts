/**
 * 03. Cascading Failure and Circuit Breakers
 * Level: Senior
 * Group: Microservices
 *
 * Problem: A shop's servers handle two endpoints: product pages, which show reviews from a
 *   Reviews service, and checkout, which never touches Reviews. One day Reviews gets slow. Within
 *   a second, checkout fails too. How does a slow service nobody needs for checkout take checkout
 *   down, and how do we keep one slow dependency's failure from spreading?
 *
 * Approach: Bound the wait, then stop calling
 *   1. Wait as long as it takes: every worker ends up waiting on Reviews, and checkout fails with
 *   it (a cascading failure). 2. A 150 ms timeout on the Reviews call: workers come back, checkout
 *   survives, but every product page fails, and a 300 ms timeout is already too long. 3. A circuit
 *   breaker with a fallback: after a burst of failures, stop calling Reviews for a while and show
 *   the page without reviews, at once.
 *
 * Cost: with no timeout, 99% of checkouts fail while Reviews is slow; with a 150 ms timeout, 0%
 *   of checkouts and 100% of product pages; with the breaker, nothing fails, pages answer in ~11
 *   ms without reviews, and Reviews gets ~17 calls a second instead of ~900.
 *
 * Pattern: timeouts, circuit breaker, graceful degradation (fallback)
 * Key insight: A server's workers are shared by every endpoint. A dependency that answers slowly
 *   holds a worker per call for as long as it takes, so the number of workers it ties up is its
 *   call rate times its latency (Little's law). When that passes the pool, everything on the
 *   server fails. A timeout caps the latency; a breaker cuts the call rate to almost zero; a
 *   fallback turns "failed" into "a bit less on the page".
 * Tradeoffs: A breaker fails some calls that would have worked (while open, and on a
 *   half-healthy dependency). Fallbacks must exist and be tested: "no reviews" is easy, "no
 *   price" is not. Timeouts too short fail healthy-but-slow calls.
 * Staff notes: Set the timeout from the dependency's normal p99.9 and from the worker budget
 *   (rate x timeout must fit well inside the pool), not from a default like 30 s. Breakers belong
 *   per dependency and per caller replica; alert on breaker state, since "open" is an outage
 *   someone is not seeing. See primitive 016 (Circuit Breaker) for the state machine itself.
 * Interview signals: "one service went down and took everything with it", "cascading failure",
 *   "thread pool exhaustion", "the site is down but CPUs are idle", "graceful degradation".
 * Real world: Netflix's Hystrix library (now in maintenance mode) popularized per-dependency
 *   timeouts, circuit breakers and fallbacks; resilience4j provides them in Java today. Envoy
 *   offers related controls: "circuit breaking" there means caps on connections and pending
 *   requests (closer to a bulkhead), and outlier detection stops sending to failing hosts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { breaker, call, clients, database, design, external, knob, loadBalancer, run, server, summary, type CallStep } from "../traffic/index.ts";

// 1,000 requests a second: 90% product pages ("read"), 10% checkouts ("write").
const users = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 2000]), mix: { read: 0.9, write: 0.1 }, hopMs: 1 });
// One pool of app servers for both endpoints: 4 machines x 50 workers = 200 requests in progress at once.
// A product page reads the product and then asks Reviews for its reviews; a checkout only writes the order.
const shop = (reviews: CallStep) =>
  server({ label: "Shop", replicas: 4, cores: 4, serviceMs: { read: 4, write: 4 }, calls: { read: ["db", reviews], write: ["db"] }, hopMs: 0.5 });
// Reviews is another team's service. We only see how long it takes to answer: 5 ms on a normal day.
const reviews = () => external({ label: "Reviews", latencyMs: 5, concurrency: 2000, hopMs: 1 });
const db = () => database({ cores: 8, readMs: 1, writeMs: 3, hopMs: 1 });

// @why Stage 1: the product page waits for Reviews as long as it takes, holding its worker.
export const noTimeout = design("1. Wait as long as it takes", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: shop("reviews"),
  reviews: reviews(),
  db: db(),
});

// @why Stage 2: give up on Reviews after 150 ms. The worker comes back; the page fails.
export const withTimeout = design("2. A timeout on the Reviews call", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: shop(call("reviews", { timeoutMs: knob("reviews timeout (ms)", 150, [10, 2000]) })),
  reviews: reviews(),
  db: db(),
});

// @why Stage 3: a circuit breaker on the Reviews call, per app server. Once half of at least 20
// @why calls in the last 2 s failed or timed out, it opens: calls fail at once, for 2 s, then 5
// @why trial calls test whether Reviews is back. Any failure (open, timeout) skips Reviews: the
// @why page is shown without reviews.
export const withBreaker = design("3. Circuit breaker with a fallback", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: shop(breaker("reviews", { timeoutMs: 150, fallback: "skip", windowMs: 2000, minCalls: 20, openMs: 2000 })),
  reviews: reviews(),
  db: db(),
});

// --- helpers for the scenarios ---

const S = { seconds: 20, seed: 1 };
// Reviews answers 200 times slower, about 1 s instead of 5 ms, from 5 s to 15 s (a bad deploy, a
// lock in its database). It is slow, not down: every call still gets an answer, eventually.
const slowReviews = [{ at: 5000, kind: "slow" as const, target: "reviews", factor: 200, durationMs: 10_000 }];
// While Reviews is slow (after a second to settle).
const during = (r: ReturnType<typeof run>) => summary(r, 6, 15);

test("broken: wait as long as it takes — slow Reviews takes checkout down too", () => {
  const r = run(noTimeout, { ...S, faults: slowReviews });
  const before = summary(r, 2, 5);
  assert.equal(before.errorRate, 0);
  assert.ok(before.threads.app > 0.04 && before.threads.app < 0.1, `workers before ${before.threads.app}`);
  const s = during(r);
  // Checkouts never call Reviews, and still almost all fail: no worker is free to take them.
  assert.ok(s.byKind.write!.errorRate > 0.98, `checkout errors ${s.byKind.write!.errorRate}`);
  assert.ok(s.byKind.read!.errorRate > 0.95, `page errors ${s.byKind.read!.errorRate}`);
  // Every worker is waiting; the CPUs that would do the work are nearly idle.
  assert.ok(s.threads.app > 0.98 && s.util.app > 0.04 && s.util.app < 0.08, `workers ${s.threads.app}, cpu ${s.util.app}`);
  // When Reviews recovers, so does everything else.
  assert.equal(summary(r, 16, 20).errorRate, 0);
});

test("timeout: checkout survives, every product page fails", () => {
  const r = run(withTimeout, { ...S, faults: slowReviews });
  const s = during(r);
  assert.equal(s.byKind.write!.errorRate, 0);
  assert.ok(s.byKind.write!.p99 > 17 && s.byKind.write!.p99 < 25, `checkout p99 ${s.byKind.write!.p99}`);
  assert.equal(s.byKind.read!.errorRate, 1);
  // 900 pages a second x 0.15 s = 135 workers waiting on Reviews, of 200.
  assert.ok(s.threads.app > 0.65 && s.threads.app < 0.8, `workers ${s.threads.app}`);
  assert.ok(s.links["app>reviews"].timedOut > 850, `timed out ${s.links["app>reviews"].timedOut}`);
});

test("broken: a 300 ms timeout is already too long — checkouts fail again", () => {
  const r = run(withTimeout, { ...S, faults: slowReviews, knobs: { "reviews timeout (ms)": 300 } });
  const s = during(r);
  // 900 x 0.3 s = 270 workers needed, 200 exist.
  assert.ok(s.threads.app > 0.98, `workers ${s.threads.app}`);
  assert.ok(s.byKind.write!.errorRate > 0.2 && s.byKind.write!.errorRate < 0.35, `checkout errors ${s.byKind.write!.errorRate}`);
  assert.ok(s.byKind.write!.p50 > 450 && s.byKind.write!.p50 < 700, `checkout p50 ${s.byKind.write!.p50}`);
});

test("breaker: pages without reviews, nothing fails, and Reviews is left alone", () => {
  const r = run(withBreaker, { ...S, faults: slowReviews });
  const s = during(r);
  assert.equal(s.errorRate, 0);
  // Nearly every page is answered without reviews (degraded), and fast.
  assert.ok(s.degradedRate > 0.85, `degraded ${s.degradedRate}`);
  assert.ok(s.byKind.read!.p50 < 13, `page p50 ${s.byKind.read!.p50}`);
  assert.ok(s.threads.app < 0.1, `workers ${s.threads.app}`);
  // The breakers are open; Reviews gets only the trial calls.
  const link = s.links["app>reviews"];
  assert.ok(link.openShare > 0.95, `open ${link.openShare}`);
  assert.ok(link.calls > 12 && link.calls < 22 && link.shortCircuited > 850, `calls ${link.calls}, short-circuited ${link.shortCircuited}`);
  // After Reviews recovers, the trial calls succeed, the breakers close and pages have reviews again.
  const after = summary(r, 17, 20);
  assert.equal(after.links["app>reviews"].openShare, 0);
  assert.ok(after.degradedRate < 0.01, `degraded after ${after.degradedRate}`);
});
