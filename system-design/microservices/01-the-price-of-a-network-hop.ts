/**
 * 01. The Price of a Network Hop
 * Level: Senior
 * Group: Microservices
 *
 * Problem: An order request needs the buyer's profile, a price, a stock check, a note to the
 *   recommendations system and a database write. In one program those are function calls. Split
 *   into services, each one becomes a request over the network to another machine. What does
 *   that cost, and what does it risk?
 *
 * Approach: Count the hops, keep the request path short
 *   1. One service does all the work: one network call, to the database. 2. Five services, each
 *   called in turn by Orders: every call adds a round trip and the CPU to encode and decode its
 *   message, and Orders holds a worker while it waits on each one. When the least important of
 *   them slows down, every order fails. 3. Fewer, coarser services on the request path (Orders
 *   owns pricing and stock), and side work sent on a queue: nothing slow can block an order.
 *
 * Cost: one service answers in ~15 ms for ~$1.05 an hour; five services in ~30 ms for ~$2.41 (13
 *   ms of CPU per order instead of 8, plus a spare machine per service); the coarser design ~21
 *   ms for ~$1.81, and a 50x slowdown of Recommendations costs it no failed orders.
 *
 * Pattern: synchronous calls on the request path, asynchronous side work (queue)
 * Key insight: A function call costs nanoseconds and cannot fail on its own; a network call costs
 *   a round trip, serialization, a worker held while waiting, and a new way to fail. Calls in a
 *   row add their latencies, and the request succeeds only if every one of them does. Put a
 *   service boundary where teams and data need one, not around every function.
 * Tradeoffs: Coarser services mean bigger codebases per team and fewer independent deploys.
 *   Async side work is eventually consistent: Recommendations learns about an order seconds
 *   later, and the queue must be watched.
 * Staff notes: Draw the request path and count the synchronous hops before approving a split;
 *   each is ~1 ms, more at p99, plus whatever its own dependencies cost. Ask of every call: does
 *   the user's answer depend on it? If not, it belongs on a queue. Timeouts and circuit breakers
 *   limit how long a bad dependency can hold your workers, but removing the dependency from the
 *   request path is stronger than either.
 * Interview signals: "split the monolith", "microservices", "service mesh", "latency budget",
 *   "chatty services", "one slow service took everything down".
 * Real world: Service meshes (Envoy sidecars, as in Istio) add a proxy on each side of every call,
 *   which is part of the per-hop cost. Many companies that split aggressively later merged
 *   "nano-services" back together; Amazon's Prime Video team documented moving a monitoring
 *   pipeline from distributed services back into one process and cutting its cost by about 90%.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// 1,000 orders a second. Users are measured from our edge, 1 ms away, so the numbers below are
// time spent inside our systems. The business logic costs 8 ms of CPU per order however it is split.
const users = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 5000]), hopMs: 1 });
const db = () => database({ cores: 8, readMs: 2, writeMs: 3, hopMs: 1 });

// @why Stage 1: one program. Profile, pricing, stock and the recommendations note are function
// @why calls inside it; the only network call is the database write.
export const oneService = design("1. One service", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: server({ label: "Shop", replicas: 4, cores: 4, serviceMs: { read: 8, write: 8 }, calls: ["db"] }),
  db: db(),
});

// A service on its own machines. Every call to it crosses the network: 1 ms each way (the wire
// plus a proxy on each side), and 1 ms of CPU to decode the request and encode the answer.
const SERIALIZE_MS = 1;
const service = (label: string, workMs: number, calls: string[] = [], replicas = 2) =>
  server({ label, replicas, cores: 4, serviceMs: { read: workMs + SERIALIZE_MS, write: workMs + SERIALIZE_MS }, calls, hopMs: 1 });

// @why Stage 2: the same 8 ms of work split into five services. Orders calls each in turn and
// @why waits for every answer before replying, holding one of its workers the whole time.
export const fiveServices = design("2. Five services, called in turn", {
  users: users(),
  lb: loadBalancer({ to: "orders" }),
  orders: service("Orders", 2, ["profile", "pricing", "inventory", "recs", "db"], 4),
  profile: service("Profile", 1.5),
  pricing: service("Pricing", 2),
  inventory: service("Inventory", 1.5),
  recs: service("Recommendations", 1),
  db: db(),
});

// @why Stage 3: Orders owns pricing and stock (they change together and share data), so they are
// @why function calls again. Telling Recommendations about the order is side work: Orders drops
// @why a message on a queue and answers; consumers deliver it to Recommendations in the background.
export const fewerHops = design("3. Fewer hops, side work on a queue", {
  users: users(),
  lb: loadBalancer({ to: "orders" }),
  orders: service("Orders", 5.5, ["profile", "db", "events"], 4),
  profile: service("Profile", 1.5),
  events: queue({ label: "Order events", consumers: 20, workMs: 1, to: "recs" }),
  recs: service("Recommendations", 1),
  db: db(),
});

// --- helpers for the scenarios ---

const S = { seconds: 12, seed: 1 };
// Recommendations runs 50 times slower from 5 s to 10 s: a bad deploy, a full disk, a GC storm.
const slowRecs = ["recs-1", "recs-2"].map((target) => ({ at: 5000, kind: "slow" as const, target, factor: 50, durationMs: 5000 }));

test("one service: 1,000 orders a second answered in about 15 ms", () => {
  const s = summary(run(oneService, S), 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 12 && s.p50 < 16, `p50 ${s.p50}`);
  assert.ok(s.util.app > 0.45 && s.util.app < 0.55, `cpu ${s.util.app}`);
  assert.ok(Math.abs(s.costPerHour - 1.05) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: five services — the same work takes twice as long and costs more than twice as much", () => {
  // One run per scenario, so a lesson link can name it; the one-service numbers are its test's.
  const five = summary(run(fiveServices, S), 2);
  assert.equal(five.errorRate, 0);
  // Five round trips of ~2 ms and 5 ms more CPU (encode and decode at each service): ~15 ms -> ~30 ms.
  assert.ok(five.p50 > 27 && five.p50 < 33, `p50 ${five.p50}`);
  // $1.05 an hour for one service.
  assert.ok(five.costPerHour > 2.3 && five.costPerHour < 2.5, `cost ${five.costPerHour}`);
  // Two machines each, and Profile, Pricing and Inventory are only about a third busy.
  for (const id of ["profile", "pricing", "inventory"]) assert.ok(five.util[id] > 0.27 && five.util[id] < 0.4, `${id} cpu ${five.util[id]}`);
});

test("broken: five services — one slow service stalls every order", () => {
  const r = run(fiveServices, { ...S, faults: slowRecs });
  assert.equal(summary(r, 2, 5).errorRate, 0);
  const s = summary(r, 6, 10);
  assert.ok(s.errorRate > 0.9, `errors ${s.errorRate}`);
  // Orders' workers all wait on Recommendations while Orders' own CPUs sit idle.
  assert.ok(s.threads.orders > 0.95 && s.util.orders < 0.2, `orders workers ${s.threads.orders}, cpu ${s.util.orders}`);
  // Profile, Pricing and Inventory are healthy and nearly idle: nothing reaches them.
  assert.ok(s.util.pricing < 0.1, `pricing ${s.util.pricing}`);
});

test("fewer hops: two network calls and a queue, about 21 ms", () => {
  const s = summary(run(fewerHops, S), 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 19 && s.p50 < 23, `p50 ${s.p50}`);
  assert.ok(s.costPerHour > 1.7 && s.costPerHour < 1.9, `cost ${s.costPerHour}`);
  assert.ok(s.backlog.events < 20, `backlog ${s.backlog.events}`);
});

test("fewer hops: a slow Recommendations service only delays the queue", () => {
  const r = run(fewerHops, { ...S, faults: slowRecs });
  const s = summary(r, 5, 10);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 > 29 && s.p99 < 36, `p99 ${s.p99}`);
  // Messages pile up while Recommendations is slow, and drain once it recovers.
  const at10 = summary(r, 9.9, 10);
  assert.ok(at10.backlog.events > 4000 && at10.backlog.events < 5000, `backlog at 10 s ${at10.backlog.events}`);
  assert.ok(at10.oldestMs.events > 4000 && at10.oldestMs.events < 5000, `oldest at 10 s ${at10.oldestMs.events}`);
  assert.ok(summary(r, 11.9, 12).backlog.events < 50, `backlog at 12 s ${summary(r, 11.9, 12).backlog.events}`);
});
