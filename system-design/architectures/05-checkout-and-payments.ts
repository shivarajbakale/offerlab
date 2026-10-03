/**
 * 05. Checkout and Payments
 * Level: Senior
 * Group: Architectures
 *
 * Problem: A shop's checkout calls an outside payment provider that usually answers in 300 ms
 *   and sometimes takes seconds. Never charge a shopper twice, and keep the shop open for
 *   browsing whatever the provider does.
 *
 * Approach: Contain the slow dependency, then take it out of the request
 *   1. Pay inside the request; shoppers give up after 1 s and click Pay again. A 3x slower
 *      provider finishes payments after the shopper gave up: without idempotency keys, double charges.
 *   2. A 10 s timeout ends that, but a 10x slower provider holds every app worker: page views fail too.
 *   3. Bulkhead: checkout runs in its own pool of 60 workers. Browsing survives; most checkouts fail.
 *   4. Accept the order, put the payment on a queue, confirm later. Shoppers notice nothing;
 *      the queue holds the unpaid orders until the provider recovers.
 *
 * Cost: 1,000 requests a second, 10% checkouts, on three app servers ($0.88 an hour). The
 *   bulkhead adds a checkout server ($1.05); the queue and 60 consumers instead ($1.03).
 *   Checkouts need 100 x 0.3 s = 30 workers normally and 300 when the provider is 10x slower.
 *
 * Pattern: idempotency, bulkhead, asynchronous processing
 * Key insight: A call to a slow service holds a worker for as long as it takes. Whatever shares
 *   those workers fails with it. Give the slow call its own small pool, or take it out of the
 *   request entirely; and make every retry of a payment carry the same idempotency key.
 * Tradeoffs: Accepting the order before the card is charged means some orders fail later (card
 *   declined) and the shopper must be told after they have left. A bulkhead's pool size is a
 *   guess: too small rejects checkouts on a normal day, too big protects nothing.
 * Staff notes: The simulator does not model money. "Payments that finished after the shopper gave
 *   up" stand in for double charges; idempotency keys, circuit breakers and payment state machines
 *   are explained, not simulated. Store the key with the order before calling the provider, so a
 *   crash between "charged" and "recorded" can be resolved by asking the provider.
 * Interview signals: "design a payment system", "exactly-once", "idempotency key", "what if the
 *   payment provider is down", "timeouts and retries", "bulkhead", "order state machine".
 * Real world: Stripe's API accepts an Idempotency-Key header and returns the stored first result
 *   for a repeated key once the first request has finished (while it is still running, a repeat
 *   gets 409 Conflict and should be retried later); Stripe keeps keys for at least 24 hours. Netflix's Hystrix library made thread-pool bulkheads and circuit breakers
 *   common practice for calls to other services.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, external, knob, loadBalancer, queue, run, server, summary, type CallStep } from "../traffic/index.ts";

// 1,000 requests a second: 90% page views (reads) and 10% checkouts (writes). Shoppers who see
// an error or wait too long click again, up to 3 tries. Page views cost the app 6 ms of CPU and
// read the database; a checkout costs 8 ms, writes the order and charges the card.
const shoppers = (timeoutMs: number) =>
  clients({ to: "lb", qps: knob("qps", 1000, [10, 2000]), mix: { read: 0.9, write: 0.1 }, timeoutMs, retry: "immediate" });
// Three app servers, 4 cores and 60 workers each: 180 requests in progress at most.
const app = (write: CallStep[]) =>
  server({ replicas: 3, cores: 4, threads: 60, queue: 100, serviceMs: { read: 6, write: 8 }, calls: { read: ["db"], write } });
const db = () => database({ cores: 4, readMs: 1, writeMs: 3 });
const provider = () => external({ label: "Payment provider", latencyMs: 300 });

// @why Stage 1: the app writes the order, calls the payment provider and waits for its answer, all
// @why while the shopper waits. The shopper's app gives up after 1 second and lets them press Pay again.
export const payInRequest = design("1. Pay inside the request", {
  users: shoppers(1000),
  lb: loadBalancer({ to: "app" }),
  app: app(["db", "pay"]),
  db: db(),
  pay: provider(),
});

// @why Stage 2: the same flow, but the shopper's app waits up to 10 seconds, so a slow payment is
// @why not mistaken for a failed one.
export const longTimeout = design("2. Longer timeout", {
  users: shoppers(10_000),
  lb: loadBalancer({ to: "app" }),
  app: app(["db", "pay"]),
  db: db(),
  pay: provider(),
});

// @why Stage 3 (bulkhead): checkouts go to a separate checkout service with its own 60 workers and a
// @why short queue. When they are all waiting on the provider, the next checkout is refused at once,
// @why and the app servers' workers stay free for page views.
export const bulkhead = design("3. Separate pool for checkout", {
  users: shoppers(10_000),
  lb: loadBalancer({ to: "app" }),
  app: app(["checkout"]),
  checkout: server({ cores: 4, threads: 60, queue: 10, serviceMs: { read: 2, write: 2 }, calls: ["db", "pay"] }),
  db: db(),
  pay: provider(),
});

// @why Stage 4: the request writes the order as "payment pending", drops a payment job on a queue and
// @why answers "order received". 60 consumers charge the cards in the background and confirm by email.
export const payLater = design("4. Accept the order, pay from a queue", {
  users: shoppers(10_000),
  lb: loadBalancer({ to: "app" }),
  app: app(["db", "payments"]),
  db: db(),
  payments: queue({ label: "Payment queue", consumers: knob("consumers", 60, [1, 1000]), workMs: 300, via: "pay" }),
  pay: provider(),
});

// --- helpers for the scenarios ---

const S = { seconds: 15, seed: 1 };
// The provider gets slower from 4.5 s to 8.5 s: 3 times (about 0.9 s a payment) or 10 times (3 s).
const providerSlow = (factor: number, durationMs = 4000) => [{ at: 4_500, kind: "slow" as const, target: "pay", factor, durationMs }];

test("pay inside the request: on a normal day every checkout and page view succeeds", () => {
  const s = summary(run(payInRequest, S), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 < 60, `p50 ${s.p50}`);
  // Even on a normal day, the rare payment that takes over a second finishes after the shopper left.
  assert.ok(s.wasted > 0 && s.wasted < 20, `wasted ${s.wasted}`);
  assert.ok(s.threads.app < 0.3, `workers ${s.threads.app}`);
});

test("broken: pay inside the request — a slow provider finishes payments after the shopper gave up", () => {
  const r = run(payInRequest, { ...S, faults: providerSlow(3) });
  const s = summary(r, 4.5);
  // Each of these is a card charged for a checkout the shopper was told had failed,
  // and the shopper pressed Pay again.
  assert.ok(s.wasted > 150 && s.wasted < 300, `paid after giving up ${s.wasted}`);
  assert.ok(s.retries > 10, `retries ${s.retries}`);
  assert.ok(s.errorRate < 0.01, "almost every checkout succeeds in the end: some of them twice");
  assert.ok(summary(r, 5.5, 8.5).threads.app < 0.8, "workers are busier, but not yet exhausted");
});

test("longer timeout: the same slow provider, and no payment finishes after the shopper gave up", () => {
  const s = summary(run(longTimeout, { ...S, faults: providerSlow(3) }), 4.5);
  assert.equal(s.wasted, 0);
  assert.equal(s.errorRate, 0);
  assert.ok(s.threads.app < 0.6, `workers ${s.threads.app}`);
});

test("broken: longer timeout — a 10x slower provider holds every worker and page views fail too", () => {
  const r = run(longTimeout, { ...S, faults: providerSlow(10) });
  assert.equal(summary(r, 1, 4.5).errorRate, 0);
  const s = summary(r, 5.5, 8.5);
  // Checkouts are 10% of requests; far more than that fail, so page views are failing.
  assert.ok(s.errorRate > 0.15, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.9 && s.util.app < 0.45, `workers ${s.threads.app}, cpu ${s.util.app}`);
  assert.ok(s.p50 > 90, `p50 ${s.p50}`);
  // Within about two seconds of the slowdown, every worker is waiting on the provider.
  assert.ok(summary(r, 5, 5.5).threads.app < 0.6 && summary(r, 6.5, 7).threads.app > 0.97, "workers fill over about two seconds");
});

test("separate pool: during the same outage, page views are untouched", () => {
  const s = summary(run(bulkhead, { ...S, faults: providerSlow(10) }), 5.5, 8.5);
  assert.ok(s.errorRate < 0.1, `errors ${s.errorRate}: no more than the checkouts`);
  assert.ok(s.p50 < 60, `p50 ${s.p50}`);
  assert.ok(s.threads.app < 0.6 && s.threads.checkout > 0.95, `app ${s.threads.app}, checkout ${s.threads.checkout}`);
  assert.ok(Math.abs(s.costPerHour - 1.05) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: separate pool — most checkouts fail while the provider is slow", () => {
  const s = summary(run(bulkhead, { ...S, faults: providerSlow(10) }), 5.5, 8.5);
  // 60 workers at 3 s a payment finish 20 checkouts a second out of 100.
  const checkoutsFailed = s.errorRate / 0.1;
  assert.ok(checkoutsFailed > 0.7, `checkouts failed ${checkoutsFailed}`);
});

test("queue: the same outage, and shoppers notice nothing", () => {
  const r = run(payLater, { ...S, faults: providerSlow(10) });
  const s = summary(r, 4.5);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 < 80, `p99 ${s.p99}`);
  assert.ok(Math.abs(s.costPerHour - 1.03) < 0.02, `cost ${s.costPerHour}`);
  // At 10 s: about 360 orders waiting, the oldest about 3.5 s old.
  const peak = summary(r, 9, 10);
  assert.ok(peak.backlog.payments > 320 && peak.backlog.payments < 400 && peak.oldestMs.payments > 3000, `backlog ${peak.backlog.payments}, oldest ${peak.oldestMs.payments}`);
  // Payments started during the outage still take up to 3 s, then 60 consumers do 200 a second
  // against 100 arriving: the backlog shrinks by about 100 a second.
  const [at14, at15] = [summary(r, 13, 14).backlog.payments, summary(r, 14).backlog.payments];
  assert.ok(at14 < 200 && at15 < 100 && at15 < at14, `draining: ${at14} at 14 s, ${at15} at 15 s`);
});

test("queue: the provider down for 4 seconds — failed payments go back on the queue and are retried", () => {
  const down = [
    { at: 4_500, kind: "kill" as const, target: "pay" },
    { at: 8_500, kind: "restart" as const, target: "pay" },
  ];
  const r = run(payLater, { ...S, faults: down });
  assert.equal(summary(r, 4.5).errorRate, 0, "shoppers notice nothing");
  // By 8.5 s about 360 orders wait: ~150 visible, the rest hidden until their next try. Every held
  // job is tried again each 1.3 s (0.3 s of work, then 1 s hidden), more than 60 consumers keep up with.
  const during = summary(r, 8, 8.5);
  assert.ok(during.backlogTotal.payments > 300 && during.backlogTotal.payments < 420, `held ${during.backlogTotal.payments}`);
  assert.ok(during.backlog.payments > 100 && during.backlog.payments < 220, `visible ${during.backlog.payments}`);
  // The oldest has waited since before the outage began: a retry does not reset its age.
  assert.ok(during.oldestMs.payments > 4000, `oldest ${during.oldestMs.payments}`);
  assert.equal(summary(r, 11.5, 12).backlogTotal.payments, 0, "every order paid soon after the provider is back");
});

test("broken: queue — a long outage leaves hundreds of orders unpaid for many seconds", () => {
  const r = run(payLater, { ...S, faults: providerSlow(10, 10_000) });
  const s = summary(r, 13, 14);
  // At 14 s: about 730 orders unpaid, the oldest over 7 seconds old, and still growing.
  assert.ok(s.backlog.payments > 650 && s.backlog.payments < 800 && s.oldestMs.payments > 7000, `backlog ${s.backlog.payments}, oldest ${s.oldestMs.payments}`);
  assert.ok(summary(r, 14).backlog.payments > s.backlog.payments, "still growing");
  assert.equal(summary(r, 4.5).errorRate, 0);
});
