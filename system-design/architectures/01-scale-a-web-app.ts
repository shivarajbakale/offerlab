/**
 * 01. Scale a Web App
 * Level: Senior
 * Group: Architectures
 *
 * Problem: A web app starts on one machine. Traffic grows. Find what breaks first, why, and
 *   the smallest change that moves the limit, one stage at a time.
 *
 * Approach: Grow one bottleneck at a time
 *   1. One machine runs the app and the database. 2. The database moves to its own machine.
 *   3. A load balancer spreads requests over stateless app servers, sessions in a shared store.
 *   4. A cache takes popular reads off the database. 5. Read replicas take the rest of the
 *   reads. 6. A queue takes slow work out of the request. 7. A CDN serves static files near
 *   users. 8. Writes still fill the one primary: the end of this design.
 *
 * Cost: one machine ~420 requests a second; separate database ~640; load balancer ~1,200;
 *   cache ~3,200; read replicas ~4,500, where the primary fills with writes. A CDN cuts the
 *   median static file from 44 ms to 20 ms but roughly triples the hourly bill.
 *
 * Pattern: horizontal scaling
 * Key insight: A system is as fast as its busiest part. Waiting time explodes as that part
 *   nears 100% busy, so find the bottleneck, give it more capacity, and look for the next one.
 *   Servers that keep nothing in memory between requests can be added and lost freely.
 * Tradeoffs: Every split adds a network hop and another machine to pay for and run. A load
 *   balancer removes the app server as a single point of failure but not the database.
 * Staff notes: Measure utilization per component and alert well before 100%; at 80% busy a
 *   single-core request with exponential work times already waits about 4 times its work time.
 *   Keep app servers stateless from day one: moving sessions out later means logging everyone
 *   out once. Health checks trade detection speed for false alarms. Real load balancers mark a
 *   server down only after several failed checks (detection ~ interval x threshold; AWS ALB's
 *   default is 30 s x 2), a machine that dies outright makes requests hang until a timeout,
 *   and many proxies retry a refused connection on another server (NGINX proxy_next_upstream,
 *   HAProxy redispatch, Envoy retries). The simulator's 1 s check that fails requests at once
 *   is a simplification.
 * Interview signals: "start simple", "how would you scale this", "single point of failure",
 *   "where is the bottleneck", "sticky sessions".
 * Real world: The classic path of most web startups: a single box, then a managed database
 *   (Amazon RDS, Cloud SQL), then an autoscaling group of app servers behind a load balancer
 *   (AWS ALB, NGINX, HAProxy) with sessions in Redis.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bottleneck,
  cache,
  cacheAside,
  cdn,
  clients,
  database,
  design,
  external,
  invalidate,
  knob,
  loadBalancer,
  queue,
  run,
  server,
  summary,
} from "../traffic/index.ts";

// Every stage gets the same traffic: 90% reads, 10% writes, from 5,000 users, and the same
// work per request. Rendering a page costs the app 6 ms of CPU for a read, 8 ms for a write.
// The database spends 3 ms of CPU on a read and 6 ms on a write.
const users = (to: string, qps: number) => clients({ to, qps: knob("qps", qps, [10, 1_000_000]) });
const APP_MS = { read: 6, write: 8 };

// @why Stage 1: the app and the database are two programs on one computer, taking turns on its 4 CPU cores.
export const oneMachine = design("1. One machine", {
  users: users("app", 200),
  app: server({ cores: 4, serviceMs: APP_MS, calls: ["db"] }),
  db: database({ machine: "app", readMs: 3, writeMs: 6 }),
});

// @why Stage 2: the database gets its own 4 cores, so the app's cores only do app work.
export const separateDatabase = design("2. Separate database", {
  users: users("app", 500),
  app: server({ cores: 4, serviceMs: APP_MS, calls: ["db"] }),
  db: database({ cores: 4, readMs: 3, writeMs: 6 }),
});

// @why Stage 3: identical app servers behind a load balancer. They keep nothing in memory between
// @why requests; each looks up the user's session in a small shared store, so any server can answer anyone.
export const loadBalanced = design("3. Load balancer and stateless servers", {
  users: users("lb", 900),
  lb: loadBalancer({ to: "app", healthCheckMs: 1000 }),
  app: server({ replicas: knob("apps", 3, [1, 20]), cores: 4, serviceMs: APP_MS, sessions: "shared", calls: ["sessions", "db"] }),
  sessions: database({ role: "store", cores: 2, readMs: 0.2, writeMs: 0.2 }),
  db: database({ cores: 4, readMs: 3, writeMs: 6 }),
});

// @why The tempting shortcut: each server keeps sessions in its own memory, and the load balancer
// @why sends each user back to the same server ("sticky sessions").
export const stickySessions = design("3. Sessions in server memory", {
  users: users("lb", 900),
  lb: loadBalancer({ to: "app", healthCheckMs: 1000, sticky: true }),
  app: server({ replicas: knob("apps", 3, [1, 20]), cores: 4, serviceMs: APP_MS, sessions: "local", calls: ["db"] }),
  db: database({ cores: 4, readMs: 3, writeMs: 6 }),
});

// From stage 4 on, traffic is bigger, so each design starts with more app servers.
const lb = () => loadBalancer({ to: "app", healthCheckMs: 1000 });
const apps = (n: number, extra: Partial<Parameters<typeof server>[0]> = {}) =>
  server({ replicas: knob("apps", n, [1, 30]), cores: 4, serviceMs: APP_MS, sessions: "shared", ...extra });
const sessions = () => database({ role: "store", cores: 4, readMs: 0.2, writeMs: 0.2 });

// @why Stage 4: reads look in the cache first and only go to the database on a miss (cache-aside).
// @why A write updates the database, then deletes the cached copy so the next read fetches the new value.
export const withCache = design("4. Add a cache", {
  users: users("lb", 1500),
  lb: lb(),
  app: apps(6, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db", invalidate("cache")] } }),
  sessions: sessions(),
  cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
  db: database({ cores: 4, readMs: 3, writeMs: 6 }),
});

// @why The same cache, but a write forgets to delete the cached copy.
export const noInvalidation = design("4. Cache without invalidation", {
  users: users("lb", 1500),
  lb: lb(),
  app: apps(6, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db"] } }),
  sessions: sessions(),
  cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
  db: database({ cores: 4, readMs: 3, writeMs: 6 }),
});

const retrying = (retry: "immediate") =>
  design("4. Cache, clients retry at once", {
    users: clients({ to: "lb", qps: knob("qps", 1500, [10, 1_000_000]), retry }),
    lb: lb(),
    app: apps(6, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db", invalidate("cache")] } }),
    sessions: sessions(),
    cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
    db: database({ cores: 4, readMs: 3, writeMs: 6 }),
  });
export const retryAtOnce = retrying("immediate");

const replicated = (o: { readYourWrites: boolean; lagMs: number; name: string }) =>
  design(o.name, {
    users: clients({ to: "lb", qps: knob("qps", 3000, [10, 1_000_000]), rereadMs: 300 }),
    lb: lb(),
    app: apps(12, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db", invalidate("cache")] } }),
    sessions: sessions(),
    cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
    // @why Stage 5: one primary takes every write; two read replicas copy it and answer reads that miss the cache.
    db: database({ replicas: knob("dbReplicas", 3, [1, 6]), lagMs: knob("lagMs", o.lagMs, [0, 5000]), readYourWrites: o.readYourWrites, cores: 4, readMs: 3, writeMs: 6 }),
  });
export const replicas = replicated({ readYourWrites: true, lagMs: 50, name: "5. Read replicas" });
// @why A replica that falls a second behind (heavy writes, a slow disk), and reads that go to any replica.
export const replicasStale = replicated({ readYourWrites: false, lagMs: 1000, name: "5. Lagging replicas, reads from any replica" });
export const replicasLagging = replicated({ readYourWrites: true, lagMs: 1000, name: "5. Lagging replicas, read your own writes" });

// @why The product now sends a confirmation email on every save, inside the request: the app worker waits for the email provider.
export const emailInRequest = design("5. Email sent inside the request", {
  users: clients({ to: "lb", qps: knob("qps", 3000, [10, 1_000_000]), rereadMs: 300 }),
  lb: lb(),
  app: apps(12, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db", invalidate("cache"), "mail"] } }),
  sessions: sessions(),
  cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
  db: database({ replicas: knob("dbReplicas", 3, [1, 6]), lagMs: 50, readYourWrites: true, cores: 4, readMs: 3, writeMs: 6 }),
  mail: external({ label: "Email provider", latencyMs: 300 }),
});

const queued = (consumers: number, name: string) =>
  design(name, {
    users: clients({ to: "lb", qps: knob("qps", 3000, [10, 1_000_000]), rereadMs: 300 }),
    lb: lb(),
    app: apps(12, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db", invalidate("cache"), "jobs"] } }),
    sessions: sessions(),
    cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
    db: database({ replicas: knob("dbReplicas", 3, [1, 6]), lagMs: 50, readYourWrites: true, cores: 4, readMs: 3, writeMs: 6 }),
    // @why Stage 6: the request only drops a job on the queue; consumers send the emails in the background.
    jobs: queue({ consumers: knob("consumers", consumers, [1, 1000]), workMs: 300, via: "mail" }),
    mail: external({ label: "Email provider", latencyMs: 300 }),
  });
export const withQueue = queued(150, "6. Queue for slow work");
export const fewConsumers = queued(60, "6. Queue with too few consumers");

// From stage 7 on, the traffic includes what a browser really fetches: each page view also
// loads images, scripts and stylesheets (static files), and 30% of users are on another continent.
const fullTraffic = (o: { staticTo?: string; write?: number } = {}) =>
  clients({
    to: "lb",
    ...(o.staticTo ? { staticTo: o.staticTo } : {}),
    qps: knob("qps", 6000, [10, 1_000_000]),
    mix: { read: 0.45, write: knob("writes", o.write ?? 0.05, [0, 0.5]), static: 0.5 },
    farShare: 0.3,
    rereadMs: 300,
  });
const fullStack = (o: { staticTo?: string; write?: number }, name: string) =>
  design(name, {
    users: fullTraffic(o),
    ...(o.staticTo ? { cdn: cdn({ to: "lb", capacity: 50_000 }) } : {}),
    lb: lb(),
    app: apps(12, { calls: { read: ["sessions", cacheAside("cache", "db")], write: ["sessions", "db", invalidate("cache"), "jobs"] } }),
    sessions: sessions(),
    cache: cache({ capacity: knob("cacheKeys", 20_000, [0, 100_000]) }),
    db: database({ replicas: knob("dbReplicas", 3, [1, 6]), lagMs: 50, readYourWrites: true, cores: 4, readMs: 3, writeMs: 6 }),
    jobs: queue({ consumers: knob("consumers", 300, [1, 1000]), workMs: 300, via: "mail" }),
    mail: external({ label: "Email provider", latencyMs: 300 }),
  });
// @why Without a CDN, every image and script comes from the app servers, from wherever the user is.
export const staticFromOrigin = fullStack({}, "7. Static files from the app servers");
// @why Stage 7: a CDN keeps copies of static files on servers near every user.
export const withCdn = fullStack({ staticTo: "cdn" }, "7. Add a CDN");
// @why Stage 8: the same design, but the product now writes far more (comments, likes, view counts).
export const writeHeavy = fullStack({ staticTo: "cdn", write: 0.3 }, "8. Where this design ends: writes");

// --- helpers for the scenarios ---

const KILL_AT = 10_500;

test("one machine: 200 requests a second, all served quickly", () => {
  const s = summary(run(oneMachine, { seed: 1 }), 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 < 70 && s.p99 < 120, `p50 ${s.p50}, p99 ${s.p99}`);
  assert.ok(s.util.app < 0.55);
});

test("one machine: latency bends upward as the CPUs fill", () => {
  const at = (qps: number) => summary(run(oneMachine, { seed: 1, knobs: { qps } }), 2);
  const [low, mid, high] = [at(200), at(300), at(380)];
  // From 200 to 300 requests a second the average barely moves; from 300 to 380 it jumps.
  assert.ok(high.mean - mid.mean > 2 * (mid.mean - low.mean), `${low.mean} ${mid.mean} ${high.mean}`);
  assert.ok(high.util.app > 0.85);
  assert.ok(high.mean - mid.mean > 11 && high.mean - mid.mean < 17, `300 -> 380: ${mid.mean} -> ${high.mean}`);
  assert.ok(at(420).mean > 150, "at the limit the average jumps");
});

test("broken: one machine — past about 420 requests a second it turns requests away", () => {
  const r = run(oneMachine, { seed: 1, knobs: { qps: 600 } });
  const s = summary(r, 5);
  assert.ok(s.rejectedRate > 0.2 && s.rejectedRate < 0.45, `rejected ${s.rejectedRate}`);
  assert.ok(s.util.app > 0.95);
  assert.equal(bottleneck(r, 5), "app");
});

test("broken: one machine — when it dies, every request fails", () => {
  const r = run(oneMachine, { seed: 1, faults: [{ at: KILL_AT, kind: "kill", target: "app" }] });
  assert.equal(summary(r, 0, 10).errorRate, 0);
  assert.equal(summary(r, 11).errorRate, 1);
});

test("separate database: 500 requests a second that one machine could not serve", () => {
  const before = summary(run(oneMachine, { seed: 1, knobs: { qps: 500 } }), 5);
  const after = summary(run(separateDatabase, { seed: 1 }), 5);
  assert.ok(before.errorRate > 0.05, `one machine ${before.errorRate}`);
  assert.ok(after.errorRate < 0.005, `separate ${after.errorRate}`);
});

test("broken: separate database — the app server's CPUs are the next limit", () => {
  const r = run(separateDatabase, { seed: 1, knobs: { qps: 900 } });
  const s = summary(r, 5);
  assert.ok(s.util.app > 0.95 && s.util.db < 0.85, `app ${s.util.app}, db ${s.util.db}`);
  assert.equal(bottleneck(r, 5), "app");
  assert.ok(s.errorRate > 0.2);
});

test("broken: separate database — the app server is still a single point of failure", () => {
  const r = run(separateDatabase, { seed: 1, faults: [{ at: KILL_AT, kind: "kill", target: "app" }] });
  assert.equal(summary(r, 11).errorRate, 1);
});

test("load balancer: three app servers serve 900 requests a second", () => {
  const s = summary(run(loadBalanced, { seed: 1 }), 2);
  assert.ok(s.errorRate < 0.005, `errors ${s.errorRate}`);
  assert.ok(s.util.app < 0.6);
});

test("load balancer: a dead server is routed around after the next health check", () => {
  const r = run(loadBalanced, { seed: 1, faults: [{ at: KILL_AT, kind: "kill", target: "app-2" }] });
  assert.ok(summary(r, 10.5, 11).errorRate > 0.2, "until the health check, a third of requests fail");
  assert.ok(summary(r, 11.2).errorRate < 0.01, "then two servers carry the load");
  assert.equal(summary(r).loggedOut, 0, "sessions were in the shared store, so nobody was logged out");
});

test("broken: sessions in server memory — kill a server and its users are logged out", () => {
  const r = run(stickySessions, { seed: 1, seconds: 20, faults: [{ at: KILL_AT, kind: "kill", target: "app-2" }] });
  assert.equal(summary(r, 0, 10.5).loggedOut, 0);
  const lost = summary(r, 10.5).loggedOut;
  // app-2 held 1 in 3 of the 5,000 users; those who clicked again in the window (~22%) were signed out.
  assert.ok(lost > 950 && lost < 1300, `logged out ${lost}`);
});

test("broken: load balancer — past about 1,200 requests a second the database is the limit", () => {
  const r = run(loadBalanced, { seed: 1, knobs: { qps: 1500 } });
  const s = summary(r, 10);
  assert.ok(s.util.db > 0.95, `db ${s.util.db}`);
  // App workers are all taken, yet app CPUs are not full: each worker waits on the database.
  assert.ok(s.threads.app > 0.95 && s.util.app < 0.85, `threads ${s.threads.app}, cpu ${s.util.app}`);
  assert.equal(bottleneck(r, 10), "db");
  assert.ok(s.errorRate > 0.1);
});

// --- stages 4 to 8 ---

const S = { seconds: 15, seed: 1 };
// At 4,000 requests a second one simulated request stands for 2 real ones: every machine's 4 cores
// and every pool of workers split exactly in half, so nothing is rounded.
const S2 = { ...S, scale: 2 };
const cacheRestart = [
  { at: 5000, kind: "kill" as const, target: "cache" },
  { at: 5000, kind: "restart" as const, target: "cache" },
];
const slowMail = [{ at: 5000, kind: "slow" as const, target: "mail", factor: 10, durationMs: 5000 }];

test("cache: the 1,500 requests a second that broke stage 3 now pass", () => {
  const before = summary(run(loadBalanced, { ...S, knobs: { qps: 1500 } }), 5);
  const after = summary(run(withCache, S), 5);
  assert.ok(before.errorRate > 0.1 && after.errorRate === 0, `${before.errorRate} -> ${after.errorRate}`);
  assert.ok(after.hitRate.cache > 0.75 && after.hitRate.cache < 0.83, `hit rate ${after.hitRate.cache}`);
  assert.ok(before.util.db > 0.95 && after.util.db < 0.55, `db ${before.util.db} -> ${after.util.db}`);
  assert.ok(after.staleRate < 0.01);
});

test("broken: cache without invalidation — about half of reads return old data", () => {
  const s = summary(run(noInvalidation, S), 5);
  assert.ok(s.staleRate > 0.3, `stale ${s.staleRate}`);
});

test("broken: cache — a restarted cache is empty and the database floods", () => {
  const r = run(withCache, { ...S, knobs: { qps: 2400, apps: 10 }, faults: cacheRestart });
  const before = summary(r, 2, 5);
  const after = summary(r, 5, 8);
  assert.ok(before.errorRate === 0 && before.util.db < 0.8, `db before ${before.util.db}`);
  assert.ok(after.hitRate.cache < 0.5 && after.util.db > 0.95, `hit ${after.hitRate.cache}, db ${after.util.db}`);
  const first = summary(r, 5, 6);
  assert.ok(first.hitRate.cache < 0.4 && first.util.db > 0.95, `first second: hit ${first.hitRate.cache}`);
  // Requests wait in the full queues first; errors only start after about 2 seconds.
  assert.ok(summary(r, 5, 6.5).errorRate < 0.01 && summary(r, 7.5, 8).errorRate > 0.1, "errors start near 7 s");
  assert.ok(summary(r, 8, 15).errorRate > 0.1, "still failing seconds later, while the cache slowly refills");
});

test("broken: cache — clients that retry at once add load and stretch the slow tail", () => {
  const knobs = { qps: 2400, apps: 10 };
  const calm = summary(run(withCache, { ...S, knobs, faults: cacheRestart }), 5);
  const eager = summary(run(retryAtOnce, { ...S, knobs, faults: cacheRestart }), 5);
  assert.ok(eager.retries > 1800 && eager.retries < 2500, `retries ${eager.retries}`);
  // A rescued request counts its time from the first try, so the slow tail nearly doubles.
  assert.ok(calm.p99 > 900 && eager.p99 > 1.7 * calm.p99, `p99 ${calm.p99} -> ${eager.p99}`);
  // Some retries succeed, so fewer users end with an error...
  assert.ok(calm.errorRate > 0.27 && eager.errorRate < calm.errorRate - 0.03, `errors ${calm.errorRate} -> ${eager.errorRate}`);
  // ...and the extra requests mostly bounce off the app servers' full queues (more 503s).
  assert.ok(eager.rejectedRate > calm.rejectedRate + 0.03, `rejected ${calm.rejectedRate} -> ${eager.rejectedRate}`);
});

test("broken: cache — past about 3,200 requests a second the database is the limit again", () => {
  const r = run(withCache, { ...S2, knobs: { qps: 4000, apps: 16 } });
  const s = summary(r, 5);
  assert.equal(bottleneck(r, 5), "db");
  assert.ok(s.util.db > 0.95 && s.errorRate > 0.2, `db ${s.util.db}, errors ${s.errorRate}`);
});

test("cache: 3,000 requests a second pass; by 3,300 the database turns some away", () => {
  const at = (qps: number) => summary(run(withCache, { ...S, knobs: { qps, apps: 16 } }), 5);
  const [ok, over] = [at(3000), at(3300)];
  assert.ok(ok.errorRate < 0.005 && over.errorRate > 0.05, `3,000: ${ok.errorRate}, 3,300: ${over.errorRate}`);
});

test("read replicas: 4,000 requests a second, reads that miss the cache spread over the replicas", () => {
  const s = summary(run(replicas, { ...S2, knobs: { qps: 4000, apps: 16 } }), 5);
  assert.ok(s.errorRate < 0.01, `errors ${s.errorRate}`);
  const [primary, ...copies] = s.replicaUtil.db;
  // Writes alone are 400 a second x 6 ms over 4 cores = 60%; read-your-writes reads add the rest.
  assert.ok(primary > 0.82 && primary < 0.92 && copies.every((u) => u < 0.3), `${s.replicaUtil.db}`);
  assert.equal(s.staleOwnRate, 0);
  // The cache sometimes refills from a replica that has not caught up yet.
  assert.ok(s.staleRate > 0.06 && s.staleRate < 0.13, `stale ${s.staleRate}`);
});

test("broken: lagging replicas — users reload after saving and their change is not there", () => {
  const s = summary(run(replicasStale, S), 5);
  assert.ok(s.staleOwnRate > 0.5, `own stale ${s.staleOwnRate}`);
});

test("lagging replicas with read-your-writes: everyone sees their own save at once", () => {
  const s = summary(run(replicasLagging, S), 5);
  assert.equal(s.staleOwnRate, 0);
  assert.ok(s.staleRate > 0.13 && s.staleRate < 0.2, `other users can still briefly see the old value: ${s.staleRate}`);
});

test("broken: email sent inside the request — a slow email provider takes down page views", () => {
  const r = run(emailInRequest, { ...S, faults: slowMail });
  assert.ok(summary(r, 1, 5).errorRate < 0.01);
  const s = summary(r, 6, 10);
  assert.ok(s.errorRate > 0.28 && s.errorRate < 0.4, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.9 && s.util.app < 0.5, "every app worker waits on the email provider");
});

test("queue: the same slow email provider, and users notice nothing", () => {
  const s = summary(run(withQueue, { ...S, faults: slowMail }), 6, 10);
  assert.ok(s.errorRate < 0.01 && s.p99 < 200, `errors ${s.errorRate}, p99 ${s.p99}`);
  // At 10 s, the end of the slowdown: over 1,000 jobs waiting, the oldest nearly 4 s old.
  assert.ok(s.backlog.jobs > 1000 && s.oldestMs.jobs > 3000 && s.oldestMs.jobs < 4500, `backlog ${s.backlog.jobs}, oldest ${s.oldestMs.jobs}`);
});

test("broken: too few consumers — the backlog grows without limit while users notice nothing", () => {
  const r = run(fewConsumers, S);
  const s = summary(r, 5);
  assert.ok(s.errorRate < 0.01);
  assert.ok(summary(r, 14).backlog.jobs > summary(r, 0, 8).backlog.jobs * 1.5, "growing");
  assert.ok(s.oldestMs.jobs > 3000, `oldest ${s.oldestMs.jobs}`);
});

test("broken: static files from the app servers — users far away wait for every image", () => {
  const s = summary(run(staticFromOrigin, S), 5);
  assert.ok(s.staticP99 > 200, `static p99 ${s.staticP99}`);
});

test("CDN: static files come from a server nearby", () => {
  const before = summary(run(staticFromOrigin, S), 5);
  const after = summary(run(withCdn, S), 5);
  assert.ok(before.staticP50 > 40 && after.staticP50 < 25, `static p50 ${before.staticP50} -> ${after.staticP50}`);
  assert.ok(after.hitRate.cdn > 0.92 && after.hitRate.cdn < 0.97, `cdn hit ${after.hitRate.cdn}`);
  // A miss still travels the user's own distance to the origin. About 6% of files miss and 3 in
  // 10 users are far away, so about 2 files in 100 still cross the ocean: more than 1 in 100,
  // so the p99 stays where it was.
  assert.ok(after.staticP99 > 220, `static p99 ${before.staticP99} -> ${after.staticP99}`);
  assert.ok(after.util.app < before.util.app, "the app servers no longer serve files");
  assert.ok(after.costPerHour > before.costPerHour, "a CDN is billed per request");
});

test("broken: writes — the primary database is full while the replicas sit idle", () => {
  const s = summary(run(writeHeavy, S), 5);
  const [primary, ...copies] = s.replicaUtil.db;
  assert.ok(primary > 0.95 && copies.every((u) => u < 0.3), `${s.replicaUtil.db}`);
  assert.ok(s.errorRate > 0.3, `errors ${s.errorRate}`);
});

test("broken: writes — six replicas instead of three, and the same errors", () => {
  const s = summary(run(writeHeavy, { ...S, knobs: { dbReplicas: 6 } }), 5);
  assert.ok(s.replicaUtil.db[0] > 0.95 && s.errorRate > 0.3, `errors ${s.errorRate}`);
});
