/**
 * 08. API Gateway and BFF
 * Level: Senior
 * Group: Microservices
 *
 * Problem: The app's home screen shows the user's profile, products, their cart, recommendations
 *   and reviews: five services. A phone on a mobile network is tens of milliseconds from the data
 *   center, and a user on another continent is much further. If the app calls each service
 *   itself, it pays that distance five times per screen, and every service is open to the
 *   internet.
 *
 * Approach: One call over the far network, many over the near one
 *   1. The app calls each service directly, one after another: ~0.5 s per screen nearby, ~1.5 s
 *   for a user on another continent. 2. A gateway in the data center: the app makes one call,
 *   the gateway makes the five calls 0.5 ms away and returns one answer. Far users pay the
 *   distance once. But one scraper sending most of the traffic overloads the services behind it,
 *   and one dead optional service fails every screen. 3. The gateway does the jobs a single
 *   front door is good for: a per-user rate limit, timeouts and fallbacks for the calls the screen
 *   can do without, and spare machines.
 *
 * Cost: direct calls ~515 ms per screen nearby and ~1.5 s from another continent; through the
 *   gateway ~122 ms and ~322 ms, for ~$0.37 an hour more (two gateway machines and a load
 *   balancer). A scraper sending 1,200 screens a second fills Catalog and fails ~45% of normal
 *   users' screens; a 5-a-second per-user limit turns ~96% of the scraper away and normal users
 *   see no errors. A dead Recommendations service degrades every screen instead of failing it.
 *
 * Pattern: API gateway, backend for frontend (BFF), request aggregation
 * Key insight: Latency over a far network is paid per round trip, so a screen built from many
 *   calls should cross that network once. Put the fan-out next to the services, where a call
 *   costs a millisecond, and send the client one answer shaped for its screen.
 * Tradeoffs: The gateway is on every request's path: it must be replicated and kept thin, or it
 *   becomes the system's single point of failure and its bottleneck. A BFF per client type
 *   (iOS, Android, web) duplicates some code, and teams can start putting business logic in it.
 * Staff notes: Keep business rules in the services; the gateway does routing, authentication,
 *   rate limits, aggregation and response shaping. Give each downstream call a timeout and decide
 *   per call whether the screen fails or degrades without it. One gateway for every client means
 *   one deploy can break every client; a BFF per client type limits the blast radius.
 * Interview signals: "mobile app calls many services", "chatty client", "API gateway",
 *   "backend for frontend", "GraphQL", "rate limiting at the edge", "aggregate responses".
 * Real world: Managed gateways (AWS API Gateway, Apigee, Kong) and proxies (Envoy, NGINX) do
 *   routing, authentication and rate limiting. The BFF pattern was described by Sam Newman, from
 *   SoundCloud's experience; Netflix has written about device-specific API adapters on its API
 *   layer. GraphQL servers often play the aggregating role.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { call, clients, design, knob, loadBalancer, server, summary, run } from "../traffic/index.ts";

// 300 home screens a second, from 5,000 users. Each screen is one request from the app.
const QPS = knob("screens a second", 300, [10, 3000]);
// From a phone to the data center, one way: 50 ms on a mobile network nearby, 150 ms from
// another continent.
const NEAR_MS = 50;
const FAR_MS = 150;
const SERVICES = ["profile", "catalog", "cart", "recs", "reviews"];

// The five services. Catalog does the most work (10 ms a request); the others 1-2 ms.
// `hopMs` is how far each is from whoever calls it.
const services = (hopMs: number) => ({
  profile: server({ label: "Profile", replicas: 2, serviceMs: { read: 1, write: 1 }, hopMs }),
  catalog: server({ label: "Catalog", replicas: 2, serviceMs: { read: 10, write: 10 }, hopMs }),
  cart: server({ label: "Cart", replicas: 2, serviceMs: { read: 1, write: 1 }, hopMs }),
  recs: server({ label: "Recommendations", replicas: 2, serviceMs: { read: 2, write: 2 }, hopMs }),
  reviews: server({ label: "Reviews", replicas: 2, serviceMs: { read: 1, write: 1 }, hopMs }),
});

// @why Stage 1: the app itself calls each service over the mobile network, one after another
// @why (a screen's calls often depend on earlier answers: the cart needs the user's id). The
// @why phone is drawn as a box because it is the one making the calls.
const directFrom = (oneWayMs: number) =>
  design("1. The app calls every service", {
    users: clients({ to: "phone", qps: QPS, mix: { read: 1, write: 0 }, hopMs: 0, timeoutMs: 3000 }),
    phone: server({ label: "Phone app", cores: 1000, threads: 100_000, queue: 0, serviceMs: { read: 1, write: 1 }, calls: SERVICES, hopMs: 0, costPerHour: 0 }),
    ...services(oneWayMs),
  });
export const direct = directFrom(NEAR_MS);

// Users reach the data center over the mobile network; 20% are on another continent.
const farUsers = (o: Partial<Parameters<typeof clients>[0]> = {}) =>
  clients({ to: "lb", qps: QPS, mix: { read: 1, write: 0 }, hopMs: NEAR_MS, farShare: 0.2, farHopMs: FAR_MS, timeoutMs: 3000, ...o });

// @why Stage 2: one call from the app to a gateway in the data center. The gateway makes the five
// @why calls 0.5 ms away and returns one answer shaped for the home screen.
export const gateway = design("2. One gateway call per screen", {
  users: farUsers(),
  lb: loadBalancer({ to: "gw" }),
  gw: server({ label: "Gateway", replicas: 2, serviceMs: { read: 1, write: 1 }, calls: SERVICES }),
  ...services(0.5),
});

// @why Stage 3: the front door does what a front door is good for. A per-user rate limit (5 screens
// @why a second, bursts of 10) turns a scraper away before it costs anything. Recommendations and
// @why reviews get a 100 ms timeout and a fallback: without them the screen is still useful. A
// @why third gateway machine, so losing one leaves enough.
export const guarded = design("3. Limits, fallbacks and a spare", {
  users: farUsers(),
  lb: loadBalancer({ to: "gw", rateLimit: { perSecond: 5, burst: 10 } }),
  gw: server({
    label: "Gateway",
    replicas: 3,
    serviceMs: { read: 1, write: 1 },
    calls: ["profile", "catalog", "cart", call("recs", { timeoutMs: 100, fallback: "skip" }), call("reviews", { timeoutMs: 100, fallback: "skip" })],
  }),
  ...services(0.5),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// A scraper: 10 users sending 1,200 screens a second on top of everyone else's 300.
const scraper = { "screens a second": 1500 };
const withScraper = <D extends typeof gateway>(d: D) => ({
  ...d,
  components: { ...d.components, users: farUsers({ abuseShare: 0.8, abusers: 10 }) },
});
const recsDown = [
  ...["recs-1", "recs-2"].map((target) => ({ at: 3000, kind: "kill" as const, target })),
  ...["recs-1", "recs-2"].map((target) => ({ at: 7000, kind: "restart" as const, target })),
];
const directFar = directFrom(FAR_MS);
const killOneGateway = [{ at: 3400, kind: "kill" as const, target: "gw-1" }];

test("direct: about half a second per screen for a user nearby", () => {
  const s = summary(run(direct, S), 1);
  assert.equal(s.errorRate, 0);
  // Five round trips of ~100 ms each.
  assert.ok(s.p50 > 500 && s.p50 < 530, `p50 ${s.p50}`);
  assert.ok(Math.abs(s.costPerHour - 1.7) < 0.02, `cost ${s.costPerHour}`);
  assert.ok(s.util.catalog > 0.33 && s.util.catalog < 0.42, `catalog ${s.util.catalog}`);
});

test("broken: direct calls from another continent — 1.5 s per screen", () => {
  const s = summary(run(directFar, S), 1);
  // Five round trips of ~300 ms each.
  assert.ok(s.p50 > 1480 && s.p50 < 1550, `p50 ${s.p50}`);
});

test("gateway: one round trip per screen, near and far", () => {
  const s = summary(run(gateway, S), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.byClass.normal.p50 > 115 && s.byClass.normal.p50 < 130, `near p50 ${s.byClass.normal.p50}`);
  assert.ok(s.byClass.far.p50 > 315 && s.byClass.far.p50 < 330, `far p50 ${s.byClass.far.p50}`);
  // Two gateway machines and a load balancer: ~$0.37 an hour more.
  assert.ok(Math.abs(s.costPerHour - 2.07) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: gateway with a scraper — Catalog full, and normal users' screens fail", () => {
  const s = summary(run(withScraper(gateway), { ...S, knobs: scraper }), 2);
  assert.ok(s.util.catalog > 0.98, `catalog ${s.util.catalog}`);
  assert.ok(s.byClass.normal.errorRate > 0.38 && s.byClass.normal.errorRate < 0.52, `normal errors ${s.byClass.normal.errorRate}`);
  assert.ok(s.byClass.normal.p50 > 400 && s.byClass.normal.p50 < 550, `normal p50 ${s.byClass.normal.p50}`);
});

test("broken: gateway — Recommendations down, and every screen fails", () => {
  const s = summary(run(gateway, { ...S, faults: recsDown }), 3.4, 7);
  assert.ok(s.errorRate > 0.99, `errors ${s.errorRate}`);
});

test("guarded: the rate limit turns the scraper away; normal users unharmed", () => {
  const s = summary(run(withScraper(guarded), { ...S, knobs: scraper }), 2);
  assert.equal(s.byClass.normal.errorRate, 0);
  assert.ok(s.byClass.normal.p50 > 115 && s.byClass.normal.p50 < 130, `normal p50 ${s.byClass.normal.p50}`);
  // 10 scrapers allowed 5 a second each: ~50 of their ~1,200 a second get through.
  assert.ok(s.byClass.heavy.errorRate > 0.93 && s.byClass.heavy.errorRate < 0.99, `scraper turned away ${s.byClass.heavy.errorRate}`);
  assert.ok(s.util.catalog > 0.38 && s.util.catalog < 0.48, `catalog ${s.util.catalog}`);
  assert.ok(Math.abs(s.costPerHour - 2.24) < 0.02, `cost ${s.costPerHour}`);
});

test("guarded: Recommendations down, and screens come back without it", () => {
  const s = summary(run(guarded, { ...S, faults: recsDown }), 3.4, 7);
  assert.equal(s.errorRate, 0);
  assert.ok(s.degradedRate > 0.99, `degraded ${s.degradedRate}`);
});

test("guarded: one gateway machine dies — a third of screens fail until the health check", () => {
  const r = run(guarded, { ...S, faults: killOneGateway });
  // Killed at 3.4 s; the load balancer checks every second, so it keeps sending it a third of the screens until 4 s.
  const s = summary(r, 3.5, 4);
  assert.ok(s.errorRate > 0.2 && s.errorRate < 0.45, `errors ${s.errorRate}`);
  // Answers already on their way back arrive by ~4.3 s; then two machines carry everything.
  assert.equal(summary(r, 4.4).errorRate, 0);
});
