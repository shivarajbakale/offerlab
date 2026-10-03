/**
 * 06. Async Events Between Services
 * Level: Senior
 * Group: Microservices
 *
 * Problem: Placing an order touches four services: Inventory reserves the items, Email sends the
 *   receipt, Analytics records the sale. If Orders calls each one and waits, the order works only
 *   while all of them are up. Analytics goes down for a few seconds and nobody can buy anything.
 *
 * Approach: Call only what the answer needs; tell everyone else with an event
 *   1. Orders calls Inventory, writes the order, then calls Email and Analytics in turn: any one
 *   of them down fails the order, after the order was already saved. 2. Orders reserves stock,
 *   writes the order and publishes "order placed" once; Email and Analytics each read it from
 *   their own queue, at their own pace. An Analytics outage becomes a backlog, not failed orders,
 *   but with just enough consumers it takes many seconds to drain. 3. Consumers with room to
 *   catch up: the same outage drains in about a second.
 *
 * Cost: the chain answers in ~47 ms and fails every order while Analytics is down; events
 *   answer in ~18 ms and fail none, for ~$0.30 an hour more (a queue and its consumers). A 3 s
 *   outage leaves ~2,700 events waiting; 5 consumers (about 1,250 jobs a second, for 1,000 a
 *   second of orders) still have ~1,500 waiting 6 s after recovery; 30 consumers clear it within
 *   a second.
 *
 * Pattern: publish/subscribe events, one queue per consumer (consumer groups)
 * Key insight: A synchronous call couples two services in time: both must be up at the same
 *   moment. An event on a durable queue removes that: the publisher only needs the queue, and
 *   each consumer catches up when it can. The price is that consumers see the order later, and
 *   how much later depends on how much spare capacity they have to catch up.
 * Tradeoffs: Eventual consistency (Analytics trails reality by the age of the oldest message);
 *   at-least-once delivery, so consumers must be idempotent; a broker to run; harder debugging,
 *   since one order is now spread over several logs.
 * Staff notes: Size consumers for catch-up, not for the steady rate: catch-up time is backlog
 *   divided by (consumer capacity minus arrival rate). Alert on the oldest message's age per
 *   consumer group. Writing the order and publishing the event must not be two independent
 *   steps that can half-happen: use a transactional outbox (lesson 026).
 * Interview signals: "decouple services", "event-driven", "what if the email service is down",
 *   "Kafka vs RabbitMQ", "fan out an event", "eventual consistency".
 * Real world: Kafka topics with one consumer group per downstream service (lesson 027), and
 *   SNS topics fanned out to one SQS queue per subscriber, are the common ways to give each
 *   consumer its own copy and its own pace. SQS hands a message out again when its visibility
 *   timeout passes without a delete, which is why consumers see duplicates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// 1,000 orders a second; every request places one. Times are measured from our edge, 1 ms away.
const users = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 5000]), mix: { read: 0, write: 1 }, hopMs: 1 });
const db = () => database({ cores: 8, readMs: 2, writeMs: 3, hopMs: 1 });

// A service on its own machines, 1 ms away. Its work includes 1 ms to decode and encode messages.
const service = (label: string, workMs: number, calls: string[] = [], replicas = 2) =>
  server({ label, replicas, cores: 4, serviceMs: { read: workMs, write: workMs }, calls, hopMs: 1 });

// The pieces every stage shares. Email hands each receipt to an outside email provider (5 ms).
const shared = () => ({
  users: users(),
  lb: loadBalancer({ to: "orders" }),
  inventory: service("Inventory", 2),
  email: service("Email", 1, ["provider"]),
  provider: external({ label: "Email provider", latencyMs: 5 }),
  analytics: service("Analytics", 1),
  db: db(),
});

// @why Stage 1: Orders waits for every service in turn. The order is written to the database
// @why before Email and Analytics are called, so a failure there tells the user "failed" about an
// @why order that was in fact saved.
export const chain = design("1. Call every service in turn", {
  ...shared(),
  orders: service("Orders", 2, ["inventory", "db", "email", "analytics"], 4),
});

// One durable queue per consumer, each a copy of the "order placed" event (a topic with two
// consumer groups). A consumer takes 1 ms, then delivers the event to its service.
const events = (consumers: number) => ({
  emailEvents: queue({ label: "Order events: email", consumers: 100, workMs: 1, to: "email" }),
  analyticsEvents: queue({ label: "Order events: analytics", consumers: knob("analytics consumers", consumers, [1, 100]), workMs: 1, to: "analytics" }),
});

// @why Stage 2: the user's answer needs stock reserved and the order saved, nothing more. Orders
// @why then publishes the event and answers; Email and Analytics read it in the background.
// @why Analytics has 5 consumers: each job takes about 4 ms, so they finish about 1,250 a second.
export const publish = design("2. Publish an event", {
  ...shared(),
  orders: service("Orders", 2, ["inventory", "db", "emailEvents", "analyticsEvents"], 4),
  ...events(5),
});

// @why Stage 3: the same design with 30 Analytics consumers: about 7,500 jobs a second, so a
// @why backlog drains several times faster than it built up.
export const roomToCatchUp = design("3. Consumers with room to catch up", {
  ...shared(),
  orders: service("Orders", 2, ["inventory", "db", "emailEvents", "analyticsEvents"], 4),
  ...events(30),
});

// --- helpers for the scenarios ---

const S = { seconds: 12, seed: 1 };
// Analytics goes down at 3 s (both machines: a bad deploy) and comes back at 6 s.
const analyticsOutage = [
  ...["analytics-1", "analytics-2"].map((target) => ({ at: 3000, kind: "kill" as const, target })),
  ...["analytics-1", "analytics-2"].map((target) => ({ at: 6000, kind: "restart" as const, target })),
];

test("chain: every order answered in about 47 ms while everything is up", () => {
  const s = summary(run(chain, S), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 44 && s.p50 < 50, `p50 ${s.p50}`);
  assert.ok(Math.abs(s.costPerHour - 2.07) < 0.03, `cost ${s.costPerHour}`);
});

test("broken: chain — Analytics down for 3 s, and every order fails", () => {
  const r = run(chain, { ...S, faults: analyticsOutage });
  const s = summary(r, 3.2, 6);
  assert.ok(s.errorRate > 0.99, `errors ${s.errorRate}`);
  // Each failed order had already been written: the database still took ~1,000 writes a second.
  assert.ok(s.calls.db > 950, `db calls ${s.calls.db}`);
  // Healthy again once Analytics is back.
  assert.equal(summary(r, 6.5).errorRate, 0);
});

test("publish: orders answered in about 18 ms", () => {
  const s = summary(run(publish, S), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 16 && s.p50 < 20, `p50 ${s.p50}`);
  assert.ok(Math.abs(s.costPerHour - 2.35) < 0.03, `cost ${s.costPerHour}`);
  assert.ok(s.backlog.analyticsEvents < 30 && s.backlog.emailEvents < 30, `backlogs ${JSON.stringify(s.backlog)}`);
  // Five consumers are already 80% busy at the steady rate.
  assert.ok(s.util.analyticsEvents > 0.75 && s.util.analyticsEvents < 0.85, `consumers ${s.util.analyticsEvents}`);
});

test("broken: publish with just enough consumers — no failed orders, but the backlog is slow to drain", () => {
  const r = run(publish, { ...S, faults: analyticsOutage });
  assert.equal(summary(r, 1).errorRate, 0);
  // During the outage each failed delivery hides its event for 1 s and then retries it. Every held
  // event comes back once a second, so by about 4 s the 5 consumers are busy all the time failing
  // retries, and events start waiting in plain sight too. At 5 s: ~2,000 held, a few hundred visible.
  const during = summary(r, 4.9, 5);
  assert.ok(during.backlogTotal.analyticsEvents > 1850 && during.backlogTotal.analyticsEvents < 2150, `held at 5 s ${during.backlogTotal.analyticsEvents}`);
  assert.ok(during.backlog.analyticsEvents > 150 && during.backlog.analyticsEvents < 600, `visible at 5 s ${during.backlog.analyticsEvents}`);
  assert.ok(during.util.analyticsEvents > 0.95, `consumers ${during.util.analyticsEvents}`);
  // Its oldest visible event was first published about 1.2 s ago: a retry does not reset its age.
  assert.ok(during.oldestMs.analyticsEvents > 1050 && during.oldestMs.analyticsEvents < 1400, `oldest at 5 s ${during.oldestMs.analyticsEvents}`);
  const early = summary(r, 3.9, 4);
  // For the first second the ~1,000 held events are hidden, and consumers are ~60% busy.
  assert.ok(early.backlog.analyticsEvents < 10 && early.util.analyticsEvents > 0.5 && early.util.analyticsEvents < 0.7, `at 4 s: visible ${early.backlog.analyticsEvents}, consumers ${early.util.analyticsEvents}`);
  assert.ok(early.backlogTotal.analyticsEvents > 900 && early.backlogTotal.analyticsEvents < 1100, `held at 4 s ${early.backlogTotal.analyticsEvents}`);
  // Email's queue does not notice.
  assert.ok(during.backlog.emailEvents < 30, `email backlog ${during.backlog.emailEvents}`);
  // A second after recovery every hidden event is back in line: ~2,700 waiting.
  const peak = summary(r, 6.9, 7);
  assert.ok(peak.backlog.analyticsEvents > 2500 && peak.backlog.analyticsEvents < 2900, `backlog at 7 s ${peak.backlog.analyticsEvents}`);
  // Five seconds later most of it is still waiting: only ~250 jobs a second of room.
  const late = summary(r, 11.9, 12);
  assert.ok(late.backlog.analyticsEvents > 1300 && late.backlog.analyticsEvents < 1700, `backlog at 12 s ${late.backlog.analyticsEvents}`);
  const drain = (peak.backlog.analyticsEvents - late.backlog.analyticsEvents) / 5;
  assert.ok(drain > 180 && drain < 320, `drained ${drain} a second`);
});

test("room to catch up: the same outage drains within a second", () => {
  const r = run(roomToCatchUp, { ...S, faults: analyticsOutage });
  assert.equal(summary(r, 1).errorRate, 0);
  // The backlog still builds (~3,000 events held by 6 s), but 30 consumers retry each event the
  // moment it is visible again, so almost none of it is visible at any one time.
  const held = summary(r, 5.9, 6);
  assert.ok(held.backlogTotal.analyticsEvents > 2700, `the backlog still builds: ${held.backlogTotal.analyticsEvents}`);
  assert.ok(held.backlog.analyticsEvents < 50, `visible ${held.backlog.analyticsEvents}`);
  const after = summary(r, 6.9, 7);
  assert.ok(after.backlog.analyticsEvents < 50, `backlog at 7 s ${after.backlog.analyticsEvents}`);
  const steady = summary(r, 1, 3);
  // 25 more consumers: about $0.04 an hour, and each is busy only ~13% of the time (4 ms a job).
  assert.ok(Math.abs(steady.costPerHour - 2.39) < 0.03, `cost ${steady.costPerHour}`);
  assert.ok(steady.util.analyticsEvents > 0.11 && steady.util.analyticsEvents < 0.15, `consumers ${steady.util.analyticsEvents}`);
});
