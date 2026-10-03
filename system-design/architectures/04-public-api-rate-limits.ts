/**
 * 04. Public API with Rate Limits
 * Level: Senior
 * Group: Architectures
 *
 * Problem: A public API is called by 200 client programs, each with its own API key. A handful
 *   of them (a scraper, an integration stuck in a loop) send more than half of all requests.
 *   Keep the API fast for everyone else, survive our own slowdowns, and plan capacity.
 *
 * Approach: Limit each client, fail fast, then plan for the sum
 *   1. No limits: the heavy clients fill the servers and everyone waits or gets errors.
 *   2. A per-client token bucket at the load balancer: steady rate 10 a second, burst 20.
 *      Heavy clients get 429s; everyone else is untouched. A burst of 1 punishes normal clients.
 *   3. During a slowdown, short queues reject at once instead of holding requests past the
 *      client's timeout, and clients back off instead of retrying at once.
 *   4. Twice the clients: the limit caps each client, not the total, so the fleet must grow.
 *
 * Cost: three 4-core app servers (6 ms of CPU a request) serve about 2,000 requests a second.
 *   Without limits, 2,400 a second (60% from 4 clients) rejects 16% and p50 is 260 ms. With
 *   the limit the servers are 50% busy and p99 is under 60 ms. 400 clients at 3,200 a second
 *   need 5 servers (69% busy).
 *
 * Pattern: rate limiting, load shedding
 * Key insight: A rate limit is a fairness tool, not a capacity plan. It stops one client from
 *   taking everyone's share, but the total it allows is clients x limit, which can be far more
 *   than the servers can do.
 * Tradeoffs: A strict limit with no burst rejects normal clients whose requests arrive in clumps;
 *   a large burst lets a heavy client hit hard for a moment. A per-load-balancer limit is cheap
 *   and exact on one machine, but with many gateways each one sees only part of a client's traffic.
 * Staff notes: Real gateways keep the counters in a shared store (Redis) so the limit holds across
 *   many machines, at the cost of a network round trip per request; it is exact only if the
 *   check and the decrement are one atomic step (INCR or a Lua script), not a read then a write, or keep local buckets with
 *   limit / N each and accept some error. Return 429 with Retry-After, publish the limits, and
 *   give paying customers their own. A queue longer than timeout x service rate only holds
 *   requests that will time out.
 * Interview signals: "design a rate limiter", "API gateway", "noisy neighbour", "429",
 *   "retry storm", "token bucket vs sliding window", "distributed rate limiting".
 * Real world: Public APIs like GitHub's and Stripe's publish per-key request limits and refuse
 *   requests over them (Stripe with 429; GitHub's primary rate limit with 403 or 429). Envoy and NGINX ship rate-limit modules; Envoy's global rate
 *   limit service keeps its counters in Redis.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// 200 client programs (API keys) call the API. 4 of them are heavy and send 60% of all
// requests (about 360 a second each); the other 196 send about 5 a second each. Every request
// costs the API 6 ms of CPU. Clients give up after 1 second.
const callers = (o: { users?: number; qps?: number; abuseShare?: number; retry?: "none" | "immediate" | "backoff" } = {}) =>
  clients({
    to: "lb",
    qps: knob("qps", o.qps ?? 2400, [10, 3200]),
    users: o.users ?? 200,
    abuseShare: o.abuseShare ?? 0.6,
    abusers: 4,
    retry: o.retry ?? "none",
  });
// Each app server: 4 cores, 50 workers, and room for `queue` requests waiting for a worker.
const api = (n = 3, queue = 100) => server({ replicas: knob("apps", n, [1, 12]), cores: 4, threads: 50, queue, serviceMs: { read: 6, write: 6 } });
const limit = (burst = 20) => loadBalancer({ to: "app", rateLimit: { perSecond: 10, burst } });

// @why Stage 1: anyone can send as much as they like. The load balancer hands every request to the next server.
export const noLimits = design("1. No limits", {
  users: callers(),
  lb: loadBalancer({ to: "app" }),
  app: api(),
});

// @why Stage 2: the load balancer keeps a token bucket per API key: 10 tokens a second, at most 20 saved up.
// @why Each request takes a token; with none left it gets a 429 at once and never reaches a server.
export const withLimit = design("2. Per-client rate limit", {
  users: callers(),
  lb: limit(20),
  app: api(),
});

// @why The same steady rate with a bucket that holds only 1 token: two requests 50 ms apart are one too many.
export const noBurst = design("2. Rate limit with no burst", {
  users: callers(),
  lb: limit(1),
  app: api(),
});

// @why A tempting fix for 503s during a slowdown: let each server queue 400 requests instead of 100.
export const deepQueues = design("3. Deep queues", {
  users: callers(),
  lb: limit(),
  app: api(3, 400),
});

// @why Deep queues, and client libraries that resend a failed request at once, up to 3 tries.
export const deepQueuesRetryNow = design("3. Deep queues, clients retry at once", {
  users: callers({ retry: "immediate" }),
  lb: limit(),
  app: api(3, 400),
});

// @why Stage 3: short queues reject at once when the servers fall behind, and clients wait before
// @why retrying: 100 ms, then 200 ms, each times a random factor (backoff with jitter).
export const failFast = design("3. Short queues, clients back off", {
  users: callers({ retry: "backoff" }),
  lb: limit(),
  app: api(3, 100),
});

// @why A year later the API has 400 clients. Each is still under its limit; together they send 3,200 a second.
export const twiceTheClients = design("4. Twice the clients, same servers", {
  users: callers({ users: 400, qps: 3200, abuseShare: 0.3 }),
  lb: limit(),
  app: api(3),
});

// @why Stage 4: size the fleet for the traffic the limits let through, with room to spare.
export const sizedFleet = design("4. Servers sized for what the limits allow", {
  users: callers({ users: 400, qps: 3200, abuseShare: 0.3 }),
  lb: limit(),
  app: api(5),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// Every app server runs 4 times slower for 3 seconds (a bad deploy, a noisy neighbour, a GC storm).
const SLOW_AT = 3_500;
const slowdown = [1, 2, 3].map((i) => ({ at: SLOW_AT, kind: "slow" as const, target: `app-${i}`, factor: 4, durationMs: 3000 }));

test("broken: no limits — four heavy clients make everyone wait and fail", () => {
  const r = run(noLimits, S);
  const s = summary(r, 2);
  assert.ok(s.util.app > 0.97, `cpu ${s.util.app}`);
  assert.ok(s.rejectedRate > 0.12 && s.rejectedRate < 0.22, `rejected ${s.rejectedRate}`);
  assert.ok(s.threads.app > 0.97, `workers ${s.threads.app}`);
  assert.ok(s.p50 > 200, `p50 ${s.p50}`);
  assert.equal(s.limitedRate, 0);
  assert.equal(bottleneck(r, 2), "app");
});

test("rate limit: heavy clients get 429s, everyone else is fast", () => {
  const s = summary(run(withLimit, S), 2);
  // 60% of requests come from the 4 heavy clients; they get 10 a second each, the rest is 429.
  assert.ok(s.limitedRate > 0.55 && s.limitedRate < 0.6, `limited ${s.limitedRate}`);
  assert.ok(s.rejectedRate - s.limitedRate < 0.002, "nobody gets a 503: only 429s");
  assert.ok(s.p50 < 55 && s.p99 < 70, `p50 ${s.p50}, p99 ${s.p99}`);
  assert.ok(s.util.app > 0.45 && s.util.app < 0.55, `cpu ${s.util.app}`);
});

test("broken: no burst — normal clients get 429s for requests that arrive close together", () => {
  const strict = summary(run(noBurst, S), 2);
  // Heavy clients get 10 a second each, so (1,440 - 40) / 2,400 = 58.3% of requests are their 429s.
  // Normal clients are 40% of requests; the extra 429s are theirs: about a third of their requests.
  assert.ok(strict.limitedRate > 0.69 && strict.limitedRate < 0.74, `limited ${strict.limitedRate}`);
  const normalLimited = (strict.limitedRate - 1400 / 2400) / 0.4;
  assert.ok(normalLimited > 0.28 && normalLimited < 0.4, `normal clients limited ${normalLimited}`);
});

test("broken: deep queues — requests wait past the timeout and the servers do work nobody wants", () => {
  const r = run(deepQueues, { ...S, faults: slowdown });
  const s = summary(r, 3.5, 8.5);
  assert.ok(s.timeoutRate > 0.1 && s.timeoutRate < 0.2, `timeouts ${s.timeoutRate}`);
  assert.ok(s.wasted > 1400 && s.wasted < 1900, `wasted ${s.wasted}`);
  assert.ok(s.ok > 600 && s.ok < 690, `ok ${s.ok}`);
  assert.ok(summary(r, 7.5, 8.5).p99 > 300, "still slow a second after the slowdown ends");
});

test("broken: deep queues with immediate retries — the slow tail is nearly 3 seconds", () => {
  const s = summary(run(deepQueuesRetryNow, { ...S, faults: slowdown }), 3.5, 8.5);
  assert.ok(s.p99 > 2200, `p99 ${s.p99}`);
  assert.ok(s.retries > 3000, `retries ${s.retries}`);
  assert.ok(s.wasted > 1200, `wasted ${s.wasted}`);
});

test("fail fast: short queues and backoff — no wasted work, and back to normal soon after", () => {
  const r = run(failFast, { ...S, faults: slowdown });
  const s = summary(r, 3.5, 8.5);
  assert.ok(s.timeoutRate < 0.01 && s.wasted < 100, `timeouts ${s.timeoutRate}, wasted ${s.wasted}`);
  // Deep queues finished about 640 useful requests a second over the same window.
  assert.ok(s.ok > 790, `ok ${s.ok}`);
  assert.ok(summary(r, 7.5, 8.5).p50 < 55, `p50 after ${summary(r, 7.5, 8.5).p50}`);
  // Heavy clients' 429s that got a token on a backed-off retry: slow, but they did get through.
  assert.ok(summary(r, 1, 3.5).p99 > 250 && summary(r, 8.5).p99 < 450, `p99 ${summary(r, 1, 3.5).p99}, after ${summary(r, 8.5).p99}`);
});

test("broken: twice the clients — every client is within its limit and the servers are full", () => {
  const r = run(twiceTheClients, { ...S, seconds: 7 });
  const s = summary(r, 2);
  assert.ok(s.util.app > 0.97, `cpu ${s.util.app}`);
  assert.ok(s.rejectedRate - s.limitedRate > 0.05, `503s ${s.rejectedRate - s.limitedRate}`);
  assert.ok(s.p50 > 200, `p50 ${s.p50}`);
});

test("sized fleet: five servers carry 400 clients", () => {
  const s = summary(run(sizedFleet, { ...S, seconds: 7 }), 2);
  assert.ok(s.rejectedRate - s.limitedRate < 0.002, `503s ${s.rejectedRate - s.limitedRate}`);
  assert.ok(s.util.app > 0.55 && s.util.app < 0.72, `cpu ${s.util.app}`);
  assert.ok(s.p99 < 80, `p99 ${s.p99}`);
  assert.ok(Math.abs(s.costPerHour - 0.88) < 0.02, `cost ${s.costPerHour}`);
});
