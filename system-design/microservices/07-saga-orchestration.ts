/**
 * 07. Saga Orchestration
 * Level: Staff
 * Group: Microservices
 *
 * Problem: Placing an order changes data in four services: Orders records it, Inventory reserves
 *   the items, Payments charges the card, Shipping books a courier. Each owns its own database,
 *   so there is no single transaction to wrap them in. When a step fails halfway, some services
 *   have done their part and others have not.
 *
 * Approach: A saga: local steps, each with an undo, in an order chosen for failure
 *   1. Orders calls each step in turn and stops at the first failure, with no undo: when Shipping
 *   is down, every customer is charged for an order that then fails. 2. An orchestrated saga:
 *   steps that are easy to undo first (record the order, reserve stock), then the one step that
 *   cannot be undone cheaply (the charge), then steps that only need retrying (shipping, through
 *   a queue). A Shipping outage becomes a backlog; a payment outage leaves only stock
 *   reservations to release; a slow payment provider leaves charges whose outcome Orders never
 *   learned.
 *
 * Cost: both answer in ~75 ms (most of it the payment provider). With Shipping down for 3 s,
 *   the naive chain charges ~1,000 cards a second for orders that then fail; the saga fails no
 *   orders and drains the shipping backlog about a second after recovery. With the provider down,
 *   the saga leaves ~1,000 stock reservations a second to release and takes no money. With the
 *   provider 10x slower and a 250 ms timeout, ~83% of orders time out, and ~800 charges a second
 *   go through after Orders has given up on them.
 *
 * Pattern: saga (orchestration), compensating transactions, pivot step
 * Key insight: Without a distributed transaction, every multi-service change is a sequence of
 *   local commits. Design the sequence for failure: compensable steps first, the pivot (the step
 *   you cannot take back) as late as possible, and only retryable steps after it. Then any
 *   failure before the pivot is undone, and any failure after it is retried until it succeeds.
 * Tradeoffs: No isolation: other requests can see the half-done state (stock reserved for an
 *   order that will be cancelled). Compensations are business logic, written and tested by hand.
 *   The orchestrator must persist the saga's state so it can resume after a crash.
 * Staff notes: A timeout is not a failure; it is "unknown". The orchestrator must find out
 *   (query the provider, or retry with the same idempotency key where the provider supports
 *   one) before compensating. Two-phase commit (lesson 024) gives atomicity but holds locks
 *   across services and blocks if the coordinator dies; sagas give up isolation to avoid both.
 * Interview signals: "distributed transaction", "how do you keep services consistent",
 *   "what if payment succeeds but shipping fails", "2PC vs saga", "compensating action".
 * Real world: Workflow engines such as Temporal, AWS Step Functions and Camunda run orchestrated
 *   sagas and persist each step. Card payments are often authorized first and captured later; an
 *   authorization can be voided, which makes it cheaper to undo than a captured charge.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { call, clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// 1,000 orders a second. Times are measured from our edge, 1 ms away.
const users = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 3000]), mix: { read: 0, write: 1 }, hopMs: 1 });

// A service on its own machines, 1 ms away; its CPU time includes decoding and encoding messages.
const service = (label: string, workMs: number, calls: string[] = []) =>
  server({ label, replicas: 2, cores: 4, serviceMs: { read: workMs, write: workMs }, calls, hopMs: 1 });

// The participants. Payments is an outside provider: ~40 ms per charge, 10 ms away.
const participants = () => ({
  users: users(),
  lb: loadBalancer({ to: "orders" }),
  inventory: service("Inventory", 2),
  payments: external({ label: "Payment provider", latencyMs: 40, concurrency: 5000 }),
  shipping: service("Shipping", 2),
  db: database({ label: "Orders database", cores: 8, readMs: 1, writeMs: 2, hopMs: 1 }),
});

// Orders holds a worker while it waits on each step, so it gets plenty of them.
const orders = (calls: Parameters<typeof server>[0]["calls"]) =>
  server({ label: "Orders", replicas: 4, cores: 4, threads: 300, queue: 300, serviceMs: { read: 2, write: 2 }, calls, hopMs: 1 });

// @why Stage 1: each step in turn, stopping at the first failure, with nothing to undo the steps
// @why already done. The card is charged second, so anything after it that fails leaves a
// @why customer charged for an order that does not exist.
export const noUndo = design("1. Every step in a row, no undo", {
  ...participants(),
  orders: orders(["db", call("payments"), "inventory", "shipping"]),
});

// @why Stage 2: the orchestrator (Orders) records the order as pending, reserves stock (undo:
// @why release it), then charges the card: the pivot, the one step it cannot cheaply take back,
// @why given a 250 ms timeout. It records the result and puts "book shipping" on a queue: a step
// @why that can only be retried, never undone, so it is retried until it succeeds.
export const saga = design("2. Orchestrated saga", {
  ...participants(),
  orders: orders(["db", "inventory", call("payments", { timeoutMs: 250 }), "db", "shipNext"]),
  shipNext: queue({ label: "Shipping steps", consumers: 40, workMs: 1, to: "shipping" }),
});

// --- helpers for the scenarios ---

const S = { seconds: 12, seed: 1 };
const outage = (names: string[], from: number, to: number) => [
  ...names.map((target) => ({ at: from, kind: "kill" as const, target })),
  ...names.map((target) => ({ at: to, kind: "restart" as const, target })),
];
// Shipping goes down from 3 s to 6 s.
const shippingDown = outage(["shipping-1", "shipping-2"], 3000, 6000);
// The payment provider is unreachable from 3 s to 6 s.
const paymentsDown = outage(["payments"], 3000, 6000);
// The payment provider answers 10 times slower (~400 ms) from 3 s to 6 s.
const paymentsSlow = [{ at: 3000, kind: "slow" as const, target: "payments", factor: 10, durationMs: 3000 }];

test("no undo: about 75 ms per order while everything is up", () => {
  const s = summary(run(noUndo, S), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 70 && s.p50 < 80, `p50 ${s.p50}`);
});

test("broken: no undo — Shipping down, and every customer is charged for a failed order", () => {
  const s = summary(run(noUndo, { ...S, faults: shippingDown }), 3.5, 6);
  assert.ok(s.errorRate > 0.99, `errors ${s.errorRate}`);
  // The charge (and the reservation) went through for every one of them.
  assert.ok(s.calls.payments > 950 && s.links["orders>payments"].failed === 0, `charges ${s.calls.payments}`);
  assert.ok(s.calls.inventory > 950, `reservations ${s.calls.inventory}`);
});

test("saga: about 75 ms per order while everything is up", () => {
  const s = summary(run(saga, S), 1);
  // A rare charge slower than 250 ms times out, even on a good day.
  assert.ok(s.errorRate < 0.002, `errors ${s.errorRate}`);
  assert.ok(s.p50 > 70 && s.p50 < 80, `p50 ${s.p50}`);
  assert.ok(s.backlog.shipNext < 30, `backlog ${s.backlog.shipNext}`);
});

test("saga: Shipping down — no failed orders, the booking steps wait in the queue", () => {
  const r = run(saga, { ...S, faults: shippingDown });
  assert.ok(summary(r, 1).errorRate < 0.002, `errors ${summary(r, 1).errorRate}`);
  const during = summary(r, 4.9, 5);
  // Two seconds of booking steps (~2,000) held. Each failed delivery is hidden for 1 s, and 40
  // consumers retry it the moment it is visible again, so almost none is visible at any one time.
  assert.ok(during.backlogTotal.shipNext > 1850 && during.backlogTotal.shipNext < 2150, `held ${during.backlogTotal.shipNext}`);
  assert.ok(during.backlog.shipNext < 30, `visible ${during.backlog.shipNext}`);
  // After 6 s each held step comes back as its last timeout runs out; the queue is empty just after 7 s.
  const recovering = summary(r, 6.4, 6.5);
  assert.ok(recovering.util.shipNext > 0.95 && recovering.backlogTotal.shipNext > 1000, `at 6.5 s: held ${recovering.backlogTotal.shipNext}`);
  // The oldest step waiting was first queued about 3 s earlier: retries did not reset its age.
  assert.ok(recovering.oldestMs.shipNext > 2800 && recovering.oldestMs.shipNext < 3300, `oldest ${recovering.oldestMs.shipNext}`);
  assert.ok(summary(r, 7.1, 7.2).backlogTotal.shipNext < 30, `held at 7.2 s ${summary(r, 7.1, 7.2).backlogTotal.shipNext}`);
});

test("saga: payment provider down — orders fail, stock to release, no money taken", () => {
  const s = summary(run(saga, { ...S, faults: paymentsDown }), 3.5, 6);
  assert.ok(s.errorRate > 0.99, `errors ${s.errorRate}`);
  // Every one of them reserved stock first: ~1,000 compensations a second (release the stock).
  assert.ok(s.calls.inventory > 950 && s.calls.inventory < 1050, `reservations ${s.calls.inventory}`);
  // No charge succeeded, and nothing reached Shipping.
  const pay = s.links["orders>payments"];
  assert.ok(pay.calls - pay.failed < 5, `charges ${pay.calls - pay.failed}`);
  assert.equal(s.calls.shipping, 0);
});

test("broken: saga with a slow payment provider — a timeout is not a failure", () => {
  const r = run(saga, { ...S, faults: paymentsSlow });
  const s = summary(r, 3.5, 6);
  // Charges take ~400 ms; Orders gives up after 250 ms and fails the order.
  assert.ok(s.errorRate > 0.78 && s.errorRate < 0.88, `errors ${s.errorRate}`);
  assert.ok(s.links["orders>payments"].timedOut > 750, `timeouts ${s.links["orders>payments"].timedOut}`);
  // Yet most of those charges then succeed at the provider: ~800 a second go through unseen.
  const unseen = s.wasted / 2.5;
  assert.ok(unseen > 700 && unseen < 900, `charges after giving up ${unseen}`);
  assert.ok(summary(r, 8).errorRate < 0.002);
});
