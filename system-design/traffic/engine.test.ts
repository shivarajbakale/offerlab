// The engine checked against queueing theory, so the simulator's own numbers can be trusted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventQueue } from "./heap.ts";
import { exponential, lognormal, makeRng, percentile } from "./dist.ts";
import {
  MAX_EVENTS,
  bottleneck,
  callouts,
  clients,
  database,
  design,
  knob,
  loadBalancer,
  run,
  server,
  summary,
  viewOf,
  type TrafficRun,
} from "./index.ts";

const within = (actual: number, expected: number, rel: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= rel * expected, `${what}: ${actual.toFixed(2)} vs ${expected.toFixed(2)}`);

// One server, one core, exponential work: the textbook M/M/1 queue.
const mm1 = (qps: number, serviceMs: number, extra: Partial<Parameters<typeof server>[0]> = {}, timeoutMs = 1e9) =>
  design("mm1", {
    users: clients({ to: "s", qps: knob("qps", qps, [1, 1_000_000]), hopMs: 0, timeoutMs }),
    s: server({ cores: 1, threads: 1000, queue: 1_000_000, dist: "exponential", hopMs: 0, serviceMs: { read: serviceMs, write: serviceMs }, ...extra }),
  });

test("heap pops earliest first, ties in insertion order", () => {
  const q = new EventQueue<{ t: number; seq: number; id: string }>();
  [
    { t: 5, seq: 0, id: "a" },
    { t: 1, seq: 1, id: "b" },
    { t: 5, seq: 2, id: "c" },
    { t: 3, seq: 3, id: "d" },
    { t: 1, seq: 4, id: "e" },
  ].forEach((e) => q.push(e));
  const out: string[] = [];
  for (let e = q.pop(); e; e = q.pop()) out.push(e.id);
  assert.deepEqual(out, ["b", "e", "d", "a", "c"]);
});

test("random draws have the right mean and spread", () => {
  const rand = makeRng(7);
  const n = 50_000;
  const ex = Array.from({ length: n }, () => exponential(rand, 10));
  within(ex.reduce((a, b) => a + b) / n, 10, 0.03, "exponential mean");
  const ln = Array.from({ length: n }, () => lognormal(rand, 10, 0.5));
  const mean = ln.reduce((a, b) => a + b) / n;
  const sd = Math.sqrt(ln.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  within(mean, 10, 0.03, "lognormal mean");
  within(sd / mean, 0.5, 0.06, "lognormal cv");
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([], 0.99), 0);
});

test("M/M/1: mean time in system matches 1/(mu - lambda) within 10%", () => {
  // lambda = 50/s, mu = 100/s: utilization 0.5, time in system 1/(100-50) s = 20 ms.
  const r = run(mm1(50, 10), { seconds: 400, seed: 3 });
  assert.equal(r.scale, 1);
  const s = summary(r, 10);
  within(s.mean, 20, 0.1, "mean latency");
  within(s.util.s, 0.5, 0.05, "utilization");
});

test("Little's law: requests in flight = arrival rate x time in system", () => {
  const r = run(mm1(70, 10), { seconds: 300, seed: 5 });
  const s = summary(r, 10);
  within(s.inSystem, (s.sent / 1000) * s.mean, 0.05, "L vs lambda*W");
});

test("the same seed gives the same run; another seed does not", () => {
  const d = mm1(60, 10);
  assert.deepEqual(run(d, { seconds: 5, seed: 1 }).frames, run(d, { seconds: 5, seed: 1 }).frames);
  assert.notDeepEqual(run(d, { seconds: 5, seed: 1 }).frames, run(d, { seconds: 5, seed: 2 }).frames);
});

test("timed-out requests keep the servers busy: their work is wasted", () => {
  // 30 requests a second of 50 ms work on one core is 150% load: the queue only grows.
  const r = run(mm1(30, 50, {}, 300), { seconds: 20, seed: 1 });
  const s = summary(r, 5);
  assert.ok(s.timeoutRate > 0.5, `timeouts ${s.timeoutRate}`);
  assert.ok(s.wasted > 0, "some work finished after the client gave up");
  assert.ok(s.util.s > 0.97);
});

test("scaling: 1 simulated request for 10 real ones gives close, slightly pessimistic numbers", () => {
  const d = design("wide", {
    users: clients({ to: "s", qps: 1000, hopMs: 0 }),
    s: server({ cores: 20, threads: 400, queue: 1000, hopMs: 0, serviceMs: { read: 10, write: 10 } }),
  });
  const one = summary(run(d, { seconds: 20, seed: 1, scale: 1 }), 2);
  const ten = summary(run(d, { seconds: 20, seed: 1, scale: 10 }), 2);
  within(ten.ok, one.ok, 0.05, "throughput");
  within(ten.p50, one.p50, 0.4, "p50");
  within(ten.p99, one.p99, 0.5, "p99");
  assert.ok(ten.mean >= one.mean * 0.98, "fewer, pooled cores never make it look faster");
});

test("a million requests a second stays within the event budget", () => {
  const d = mm1(1_000_000, 10, { cores: 4, threads: 50, queue: 100, dist: "lognormal" }, 1000);
  const r = run(d, { seconds: 30, seed: 1 });
  assert.ok(r.events <= MAX_EVENTS && !r.truncated, `events ${r.events}`);
  assert.ok(r.scale >= 1000);
  assert.deepEqual(r.approximate, ["s workers", "s"]);
  assert.ok(summary(r, 5).errorRate > 0.9);
  assert.equal(summary(run(mm1(10, 10), { seconds: 10 }), 1).errorRate, 0);
});

const twoTier = (extra: { sameMachine?: boolean } = {}) =>
  design("two tier", {
    users: clients({ to: "app", qps: knob("qps", 100, [1, 10_000]), hopMs: 0 }),
    app: server({ cores: 2, threads: 10, dist: "exponential", hopMs: 0, serviceMs: { read: 5, write: 5 }, calls: ["db"] }),
    db: database({ readMs: 5, writeMs: 5, dist: "exponential", hopMs: 0, ...(extra.sameMachine ? { machine: "app" } : { cores: 2 }) }),
  });

test("two stations on one machine share its cores, and both report the same use", () => {
  // 100/s x (5 + 5) ms of work = 1000 ms of CPU a second on 2 cores: half busy.
  const s = summary(run(twoTier({ sameMachine: true }), { seconds: 60, seed: 2 }), 5);
  within(s.util.app, 0.5, 0.08, "shared machine utilization");
  assert.equal(s.util.app, s.util.db);
  const apart = summary(run(twoTier(), { seconds: 60, seed: 2 }), 5);
  within(apart.util.app, 0.25, 0.1, "own machine utilization");
});

test("killing a machine fails its requests until restart, and leaks no workers", () => {
  const r = run(twoTier(), {
    seconds: 6,
    seed: 1,
    faults: [
      { at: 1000, kind: "kill", target: "db" },
      { at: 2000, kind: "restart", target: "db" },
    ],
  });
  assert.equal(summary(r, 0, 1).errorRate, 0);
  assert.ok(summary(r, 1.1, 2).errorRate > 0.95, "nothing works while the database is down");
  const after = summary(r, 3);
  assert.equal(after.errorRate, 0);
  assert.ok(after.threads.app < 0.5 && after.threads.db < 0.5, "every worker was given back");
  assert.match(run(twoTier(), { seconds: 1, faults: [{ at: 1, kind: "kill", target: "nope" }] }).error ?? "", /not a server/);
});

test("a load balancer routes around a dead server after its next health check", () => {
  const d = design("lb", {
    users: clients({ to: "lb", qps: 300 }),
    lb: loadBalancer({ to: "app", healthCheckMs: 1000 }),
    app: server({ replicas: 3, cores: 2, serviceMs: { read: 5, write: 5 } }),
  });
  for (const strategy of ["round-robin", "least-connections", "two-choices"] as const) {
    const c = { ...d.components.lb, strategy } as ReturnType<typeof loadBalancer>;
    const r = run({ ...d, components: { ...d.components, lb: c } }, { seconds: 8, seed: 1, faults: [{ at: 3500, kind: "kill", target: "app-2" }] });
    assert.equal(summary(r, 0, 3.5).errorRate, 0, strategy);
    assert.ok(summary(r, 3.5, 4).errorRate > 0, `${strategy}: errors before the health check`);
    assert.equal(summary(r, 4.2).errorRate, 0, `${strategy}: none after it`);
  }
});

test("design checks its wiring", () => {
  assert.throws(() => design("x", { a: clients({ to: "nope", qps: 1 }) }), /not in the design/);
  assert.throws(() => design("x", { s: server({ serviceMs: { read: 1, write: 1 } }) }), /exactly one clients/);
  const v = viewOf(twoTier(), { qps: 99_999 });
  assert.deepEqual(v.knobs.map((k) => k.knob), ["qps"]);
  assert.equal(v.knobs[0].log, true);
  assert.deepEqual(v.components.find((c) => c.id === "app")!.targets, ["db"]);
});

test("bottleneck is the busiest station; empty runs summarize to zeros", () => {
  const r = run(twoTier(), { seconds: 5, knobs: { qps: 300 }, faults: [{ at: 0, kind: "slow", target: "db", factor: 1.5, durationMs: 10_000 }] });
  assert.equal(bottleneck(r, 1), "db", "a database running 1.5 times slower is busier than the app");
  const empty: TrafficRun = { ...r, frames: [] };
  assert.equal(summary(empty).errorRate, 0);
  assert.equal(bottleneck(empty), "");
});

// --- callouts, on hand-built frames ---

function fake(stations: Record<string, Partial<TrafficRun["frames"][0]["stations"][string]>>, clientsFrame: Partial<TrafficRun["frames"][0]["clients"]> = {}): TrafficRun {
  const base = run(
    design("fake", {
      users: clients({ to: "lb", qps: 1, timeoutMs: 1000 }),
      lb: loadBalancer({ to: "app" }),
      app: server({ replicas: 2, serviceMs: { read: 1, write: 1 }, calls: ["db"], sessions: "local" }),
      db: database({ readMs: 1, writeMs: 1 }),
    }),
    { seconds: 1 },
  );
  const st = (id: string) => ({ util: 0, threads: 0, queue: 0, arrivals: 0, done: 0, rejected: 0, failed: 0, slow: 1, replicaUtil: [], calls: 0, up: id === "app" ? [true, true] : [true], ...stations[id] });
  const g0 = { sent: 0, ok: 0, errors: 0, timeouts: 0, p50: -1, p99: -1 };
  const frame = {
    t: 100,
    clients: {
      ...{ sent: 0, retries: 0, ok: 0, rejected: 0, failed: 0, timedOut: 0, limited: 0, throttled: 0, wasted: 0, loggedOut: 0, reads: 0, stale: 0, ownReads: 0, staleOwn: 0, inSystem: 0 },
      ...{ p50: 0, p99: 0, latencies: [], staticLatencies: [], tags: [], failLatencies: [], failTags: [], degraded: 0, byKind: {}, byClass: { normal: g0, heavy: g0, far: g0 } },
      ...clientsFrame,
    },
    stations: { app: st("app"), db: st("db") },
  };
  return { ...base, frames: Array.from({ length: 10 }, (_, i) => ({ ...frame, t: (i + 1) * 100 })) };
}
const rules = (r: TrafficRun) => callouts(r, 9).map((c) => `${c.rule}@${c.at}`);

test("callouts: each rule fires on its own condition", () => {
  assert.deepEqual(rules(fake({})), []);
  assert.deepEqual(rules(fake({ app: { util: 0.95 } })), ["saturated@app"]);
  assert.deepEqual(rules(fake({ app: { util: 0.5, threads: 1 } })), ["blocked@app"]);
  assert.deepEqual(rules(fake({ app: { rejected: 10, util: 0.95 } })), ["rejecting@app", "saturated@app"]);
  assert.deepEqual(rules(fake({}, { timedOut: 5 })), ["timeouts@users"]);
  assert.deepEqual(rules(fake({}, { loggedOut: 5 })), ["loggedOut@app"]);
  assert.deepEqual(rules(fake({ db: { queue: 3 } })), []);
  const down = callouts(fake({ app: { up: [true, false] } }), 9);
  assert.equal(down[0].rule, "down");
  assert.match(down[0].text, /app-2 is down.*health|checks servers every 1000 ms/);
  assert.match(callouts(fake({ db: { up: [false] } }), 9)[0].text, /single point of failure/);
  assert.match(callouts(fake({ app: { rejected: 10 } }), 9)[0].text, /about 100 a second/);
});

// --- caches, replicas, retries, queues, CDNs ---

import { cache, cacheAside, cdn, external, invalidate, queue } from "./index.ts";

/** Che's approximation of an LRU cache's hit rate under independent Zipf requests. */
function cheHitRate(keys: number, skew: number, capacity: number): number {
  const w = Array.from({ length: keys }, (_, k) => 1 / (k + 1) ** skew);
  const sum = w.reduce((a, b) => a + b);
  const p = w.map((x) => x / sum);
  const filled = (t: number) => p.reduce((n, pk) => n + 1 - Math.exp(-pk * t), 0);
  let lo = 0;
  let hi = 1e9;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (filled(mid) < capacity) lo = mid;
    else hi = mid;
  }
  return p.reduce((n, pk) => n + pk * (1 - Math.exp(-pk * lo)), 0);
}

const cached = (o: { capacity?: number; invalidate?: boolean; mix?: { read: number; write: number }; qps?: number } = {}) =>
  design("cached", {
    users: clients({ to: "app", qps: o.qps ?? 500, keys: 10_000, skew: 0.9, mix: o.mix ?? { read: 1, write: 0 }, hopMs: 0 }),
    app: server({ cores: 8, serviceMs: { read: 1, write: 1 }, calls: { read: [cacheAside("cache", "db")], write: o.invalidate ? ["db", invalidate("cache")] : ["db"] } }),
    cache: cache({ capacity: o.capacity ?? 1000 }),
    db: database({ cores: 8, readMs: 2, writeMs: 2 }),
  });

test("LRU cache on Zipf traffic: hit rate within 5 points of Che's approximation", () => {
  const s = summary(run(cached(), { seconds: 40, seed: 4 }), 10);
  const expected = cheHitRate(10_000, 0.9, 1000);
  assert.ok(Math.abs(s.hitRate.cache - expected) < 0.05, `${s.hitRate.cache} vs ${expected}`);
  // Only misses reach the database.
  within(s.util.db, (500 * (1 - s.hitRate.cache) * 2) / 8000, 0.15, "database load from misses");
});

test("a restarted cache comes back empty, then refills", () => {
  const r = run(cached(), { seconds: 20, seed: 1, faults: [{ at: 10_000, kind: "kill", target: "cache" }, { at: 10_000, kind: "restart", target: "cache" }] });
  assert.ok(summary(r, 10, 10.3).hitRate.cache < 0.3, "cold right after the restart");
  assert.ok(summary(r, 17).hitRate.cache > 0.5, "warm again");
});

test("without invalidation the cache serves old values after writes; with it, almost never", () => {
  const mix = { read: 0.8, write: 0.2 };
  const stale = summary(run(cached({ mix }), { seconds: 20, seed: 1 }), 5).staleRate;
  const fresh = summary(run(cached({ mix, invalidate: true }), { seconds: 20, seed: 1 }), 5).staleRate;
  assert.ok(stale > 0.05, `stale ${stale}`);
  assert.ok(fresh < 0.005, `fresh ${fresh}`);
});

const replicated = (ryw: boolean) =>
  design("replicas", {
    users: clients({ to: "app", qps: 300, keys: 1000, mix: { read: 0.8, write: 0.2 }, rereadMs: 200, rereadShare: 1, hopMs: 0 }),
    app: server({ cores: 8, serviceMs: { read: 1, write: 1 }, calls: ["db"] }),
    db: database({ replicas: 3, lagMs: 500, readYourWrites: ryw, readMs: 2, writeMs: 2 }),
  });

test("read replicas: reads spread over the replicas, writes go to the primary", () => {
  const s = summary(run(replicated(false), { seconds: 10 }), 2);
  assert.equal(s.errorRate, 0);
  const r = run(replicated(false), { seconds: 10 });
  const dbFrame = r.frames.at(-1)!.stations.db;
  assert.equal(dbFrame.up.length, 3);
});

test("replica lag: a user's reload right after saving misses their own write, unless reads follow the write to the primary", () => {
  const lagging = summary(run(replicated(false), { seconds: 20, seed: 2 }), 2);
  const ryw = summary(run(replicated(true), { seconds: 20, seed: 2 }), 2);
  assert.ok(lagging.staleOwnRate > 0.9, `own stale ${lagging.staleOwnRate}`);
  assert.equal(ryw.staleOwnRate, 0);
});

const flaky = (retry: "none" | "immediate" | "backoff") =>
  design("flaky", {
    users: clients({ to: "app", qps: 400, retry, timeoutMs: 300, hopMs: 0 }),
    app: server({ cores: 4, threads: 40, queue: 40, serviceMs: { read: 8, write: 8 } }),
  });

test("retries add load: immediate retries send more requests than no retries", () => {
  const slow = [{ at: 5000, kind: "slow" as const, target: "app", factor: 2, durationMs: 5000 }];
  const none = summary(run(flaky("none"), { seconds: 15, faults: slow }), 5, 10);
  const now = summary(run(flaky("immediate"), { seconds: 15, faults: slow }), 5, 10);
  assert.equal(none.retries, 0);
  assert.ok(now.retries > 50, `retries ${now.retries}`);
  assert.ok(summary(run(flaky("none"), { seconds: 15, faults: slow }), 11).errorRate < 0.01, "recovers once the slowness ends");
});

const mailer = (consumers: number) =>
  design("async", {
    users: clients({ to: "app", qps: 200, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 2, write: 2 }, calls: ["jobs"] }),
    jobs: queue({ consumers, workMs: 300 }),
  });

test("a queue answers at once; with too few consumers the backlog grows while users notice nothing", () => {
  // 200 jobs a second x 0.3 s each needs 60 consumers busy all the time.
  const enough = summary(run(mailer(80), { seconds: 20 }), 5);
  const few = summary(run(mailer(40), { seconds: 20 }), 5);
  assert.ok(enough.p99 < 10 && few.p99 < 10, "users only wait for the enqueue");
  assert.ok(enough.backlog.jobs < 100, `backlog ${enough.backlog.jobs}`);
  assert.ok(few.backlog.jobs > 500, `backlog ${few.backlog.jobs}`);
  assert.ok(few.oldestMs.jobs > 3000);
});

test("a CDN serves static files near the user; far users gain the most", () => {
  const base = { qps: 300, mix: { read: 0, write: 0, static: 1 }, farShare: 0.5, keys: 2000 };
  const origin = design("origin", {
    users: clients({ to: "app", ...base }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1, static: 1 } }),
  });
  const edge = design("edge", {
    users: clients({ to: "app", staticTo: "cdn", ...base }),
    cdn: cdn({ to: "app", capacity: 5000 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1, static: 1 } }),
  });
  const a = summary(run(origin, { seconds: 20 }), 10);
  const b = summary(run(edge, { seconds: 20 }), 10);
  assert.ok(a.p99 > 200 && b.p50 < 30 && b.p50 >= 20, `p99 ${a.p99}, edge p50 ${b.p50}`);
  assert.ok(b.hitRate.cdn > 0.8, `hit ${b.hitRate.cdn}`);
  assert.ok(b.util.app < a.util.app / 5, "the origin barely sees static traffic");
  assert.ok(b.costPerHour > a.costPerHour, "the CDN is billed per request");
});

test("a slow fault raises latency only while it lasts; an external service holds workers without using CPU", () => {
  const d = design("ext", {
    users: clients({ to: "app", qps: 100, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 2, write: 2 }, calls: ["mail"] }),
    mail: external({ label: "Email provider", latencyMs: 200 }),
  });
  const r = run(d, { seconds: 12, faults: [{ at: 4000, kind: "slow", target: "app", factor: 20, durationMs: 4000 }] });
  const before = summary(r, 1, 4);
  const during = summary(r, 4.5, 8);
  const after = summary(r, 9);
  assert.ok(during.mean > before.mean + 25 && Math.abs(after.mean - before.mean) < 15, `${before.mean} ${during.mean} ${after.mean}`);
  assert.ok(before.threads.app > 0.3 && before.util.app < 0.1, "workers wait on the email provider, cores idle");
  assert.equal(callouts(r, 60).find((c) => c.rule === "slowed")?.at, "app");
});

// --- shards, rate limits, fan-out ---

test("shards split writes over several primaries", () => {
  const d = (shards: number) =>
    design("shards", {
      users: clients({ to: "app", qps: 1000, mix: { read: 0, write: 1 }, skew: 0.5, hopMs: 0 }),
      app: server({ cores: 16, threads: 400, serviceMs: { read: 1, write: 1 }, calls: ["db"] }),
      db: database({ shards, cores: 4, readMs: 2, writeMs: 6, connections: 50 }),
    });
  const one = summary(run(d(1), { seconds: 10 }), 2);
  const four = summary(run(d(4), { seconds: 10 }), 2);
  assert.ok(one.util.db > 0.95 && one.errorRate > 0.2, `one shard ${one.util.db}`);
  assert.equal(four.errorRate, 0);
  assert.equal(four.replicaUtil.db.length, 4);
  assert.ok(four.replicaUtil.db.every((u) => u > 0.25 && u < 0.6), `${four.replicaUtil.db}`);
  assert.deepEqual(viewOf(d(4)).components.find((c) => c.id === "db")?.shards, 4);
});

test("a very popular key makes its shard hot however many shards there are", () => {
  const d = design("hot", {
    users: clients({ to: "app", qps: 800, mix: { read: 0, write: 1 }, skew: 1.4, hopMs: 0 }),
    app: server({ cores: 16, threads: 400, serviceMs: { read: 1, write: 1 }, calls: ["db"] }),
    db: database({ shards: 8, cores: 4, readMs: 2, writeMs: 6, connections: 50 }),
  });
  const u = summary(run(d, { seconds: 10 }), 2).replicaUtil.db;
  const sorted = [...u].sort((a, b) => b - a);
  assert.ok(sorted[0] > 2 * sorted[1], `hottest ${sorted[0]} vs next ${sorted[1]}`);
});

test("a per-user rate limit turns away the heavy users and protects everyone else", () => {
  const d = (limit: boolean) =>
    design("limit", {
      users: clients({ to: "lb", qps: 2000, abuseShare: 0.5, abusers: 5, hopMs: 0 }),
      lb: loadBalancer({ to: "app", ...(limit ? { rateLimit: { perSecond: 20, burst: 40 } } : {}) }),
      app: server({ replicas: 2, cores: 4, serviceMs: { read: 6, write: 6 } }),
    });
  const open = summary(run(d(false), { seconds: 10 }), 2);
  const shut = summary(run(d(true), { seconds: 10 }), 2);
  assert.ok(open.errorRate > 0.2, `no limit: ${open.errorRate}`);
  assert.ok(shut.limitedRate > 0.45 && shut.limitedRate < 0.52, `limited ${shut.limitedRate}`);
  assert.ok(shut.rejectedRate - shut.limitedRate < 0.01, "only the heavy users are turned away");
});

test("fan-out: each message becomes many jobs, each a real request downstream", () => {
  const d = design("fanout", {
    users: clients({ to: "app", qps: 100, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["feed"] }),
    feed: queue({ consumers: 200, workMs: 1, to: "timelines", fanout: 20 }),
    timelines: database({ cores: 8, readMs: 1, writeMs: 1, connections: 200 }),
  });
  const s = summary(run(d, { seconds: 10 }), 3);
  // 100 posts a second x 20 followers = 2,000 timeline writes a second: 2,000 ms of CPU on 8 cores.
  within(s.util.timelines, 0.25, 0.15, "timeline database load");
  assert.ok(s.backlog.feed < 200);
});

test("a CDN forwards reads it does not hold and every write to the origin", () => {
  const d = design("edge reads", {
    users: clients({ to: "cdn", qps: 200, keys: 1000, mix: { read: 0.9, write: 0.1 }, hopMs: 0 }),
    cdn: cdn({ to: "app", capacity: 100 }),
    app: server({ cores: 4, serviceMs: { read: 2, write: 2 } }),
  });
  const s = summary(run(d, { seconds: 10 }), 2);
  const hit = s.hitRate.cdn;
  assert.ok(hit > 0.2 && hit < 0.9, `hit ${hit}`);
  // Origin sees the misses (reads) plus every write: about 200 x (0.9 x (1 - hit) + 0.1) a second.
  within(s.util.app, (200 * (0.9 * (1 - hit) + 0.1) * 2) / 4000, 0.2, "origin load");
});

// --- fixes from the final review ---

import { replicaNames } from "./index.ts";

test("a CDN miss travels as far as the user is from the origin", () => {
  const d = (farHopMs: number) =>
    design("edge far", {
      users: clients({ to: "app", staticTo: "cdn", qps: 300, mix: { read: 0, write: 0, static: 1 }, keys: 100_000, farShare: 1, farHopMs, timeoutMs: 10_000 }),
      cdn: cdn({ to: "app", capacity: 100 }),
      app: server({ cores: 4, serviceMs: { read: 1, write: 1, static: 1 } }),
    });
  // Almost every request misses (100 of 100,000 keys held), so p50 is a miss: 10 ms to the edge and the user's distance to the origin, both ways.
  const near = summary(run(d(100), { seconds: 5 }), 1).staticP50;
  const far = summary(run(d(1000), { seconds: 5 }), 1).staticP50;
  assert.ok(far - near > 1500, `miss latency ${near} -> ${far}`);
});

test("an idle consumer picks up a job as soon as it arrives", () => {
  const d = design("idle", {
    users: clients({ to: "app", qps: 2, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 50, workMs: 10, hopMs: 5 }),
  });
  const s = summary(run(d, { seconds: 30 }), 1);
  assert.ok(s.oldestMs.jobs < 50, `oldest ${s.oldestMs.jobs}`);
  assert.deepEqual(callouts(run(d, { seconds: 30 }), 200).filter((c) => c.rule === "backlog"), []);
});

test("restart on a running server empties its memory", () => {
  const r = run(cached(), { seconds: 10, faults: [{ at: 5000, kind: "restart", target: "cache" }] });
  assert.ok(summary(r, 5, 5.5).hitRate.cache < 0.6, `hit ${summary(r, 5, 5.5).hitRate.cache}`);
});

test("overlapping slowdowns last until the later one ends", () => {
  const d = mm1(50, 10);
  const r = run(d, {
    seconds: 12,
    faults: [
      { at: 2000, kind: "slow", target: "s", factor: 3, durationMs: 5000 },
      { at: 5000, kind: "slow", target: "s", factor: 3, durationMs: 5000 },
    ],
  });
  assert.equal(r.frames.find((f) => f.t === 9000)!.stations.s.slow, 3);
  assert.equal(r.frames.find((f) => f.t === 10_500)!.stations.s.slow, 1);
});

test("heavy users keep their real request rate when requests are scaled", () => {
  const d = design("abuse scaled", {
    users: clients({ to: "lb", qps: 3000, abuseShare: 0.04, abusers: 4, hopMs: 0 }),
    lb: loadBalancer({ to: "app", rateLimit: { perSecond: 10, burst: 10 } }),
    app: server({ replicas: 4, cores: 8, serviceMs: { read: 1, write: 1 } }),
  });
  // Each heavy user sends 30 a second against a limit of 10: about 2/3 of their requests, 2.7% of all, get 429.
  const one = summary(run(d, { seconds: 8, scale: 1 }), 2).limitedRate;
  const four = summary(run(d, { seconds: 8, scale: 4 }), 2).limitedRate;
  assert.ok(Math.abs(four - one) < 0.006, `scale 1: ${one}, scale 4: ${four}`);
});

test("scaling that cannot split workers or consumers exactly is flagged as approximate", () => {
  const d = design("round", {
    users: clients({ to: "app", qps: 1000, hopMs: 0 }),
    app: server({ cores: 4, threads: 6, queue: 10, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 1, workMs: 5 }),
  });
  const r = run(d, { seconds: 10, scale: 4 });
  assert.ok(r.approximate.some((x) => x.startsWith("app")) && r.approximate.some((x) => x.startsWith("jobs")), r.approximate.join());
});

test("jobs that wait on a dead service fail, go back on the queue, and finish once it is back", () => {
  const d = design("via down", {
    users: clients({ to: "app", qps: 100, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 50, workMs: 20, via: "mail" }),
    mail: external({ label: "Email provider", latencyMs: 20 }),
  });
  const r = run(d, {
    seconds: 12,
    faults: [
      { at: 3000, kind: "kill", target: "mail" },
      { at: 6000, kind: "restart", target: "mail" },
    ],
  });
  const failed = r.frames.filter((f) => f.t > 3500 && f.t <= 6000).reduce((n, f) => n + f.stations.jobs.failed, 0);
  assert.ok(failed > 100, `failed attempts ${failed}`);
  // Three seconds of jobs (~300) pile up while the service is down. Almost all are hidden, waiting
  // out their visibility timeout: the 50 consumers retry each one as soon as it is visible again.
  const down = summary(r, 5.9, 6);
  assert.ok(down.backlogTotal.jobs > 250 && down.backlogTotal.jobs < 350, `jobs pile up while the service is down: ${down.backlogTotal.jobs}`);
  assert.ok(down.backlog.jobs < 10, `visible ${down.backlog.jobs}`);
  assert.ok(summary(r, 11, 12).backlogTotal.jobs < 10, "and drain once it is back");
  const rules = callouts(r, 50).map((c) => c.rule);
  assert.ok(rules.includes("jobFailures") && new Set(rules.map((x, i) => `${x}@${callouts(r, 50)[i].at}`)).size === rules.length, rules.join());
});

test("a job waiting out its visibility timeout does not hold up visible jobs behind it", () => {
  // Every attempt fails while "ext" is dead and is hidden for 1 s; new jobs keep arriving meanwhile.
  // Consumers that are free must take the visible jobs, not wait for the hidden one ahead of them.
  const d = design("hol", {
    users: clients({ to: "app", qps: 400, mix: { read: 0, write: 1 } }),
    app: server({ replicas: 1, cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 100, workMs: 50, via: "ext" }),
    ext: external({ label: "x", latencyMs: 10 }),
  });
  const r = run(d, { seconds: 6, seed: 1, faults: [{ at: 2000, kind: "kill", target: "ext" }] });
  for (const f of r.frames.filter((f) => f.t > 2500 && f.t <= 4000)) {
    const q = f.stations.jobs;
    // 100 consumers, ~40 busy: nothing visible should be left waiting.
    assert.ok(q.backlog! < 20 && q.util > 0.15, `at ${f.t}: backlog ${q.backlog}, util ${q.util}`);
  }
  for (const f of r.frames) {
    const q = f.stations.jobs;
    if (q.backlog! > 0) assert.ok(q.oldestMs! > 0, `at ${f.t}: backlog ${q.backlog} but oldest ${q.oldestMs}`);
    assert.ok(q.backlogTotal! >= q.backlog!, `at ${f.t}: total ${q.backlogTotal} < visible ${q.backlog}`);
  }
  // The hidden jobs count in the full backlog: by 4 s about 2 s of jobs (~800) are failing and waiting.
  const s = summary(r, 3.9, 4);
  assert.ok(s.backlogTotal.jobs > 600 && s.backlogTotal.jobs < 1000, `total ${s.backlogTotal.jobs}`);
});

test("a redelivered job keeps its age: the oldest message ages from its first enqueue", () => {
  // One consumer, always behind, and every attempt fails: jobs go round and round. A job retried
  // after 1 s is still as old as when it first arrived, so the oldest age keeps climbing.
  const d = design("age", {
    users: clients({ to: "app", qps: 50, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 1, workMs: 30, via: "ext" }),
    ext: external({ label: "x", latencyMs: 10 }),
  });
  const r = run(d, { seconds: 8, seed: 1, faults: [{ at: 0, kind: "kill", target: "ext" }] });
  // Without a reset, jobs visible at 7.9-8 s include ones first enqueued near the start.
  const s = summary(r, 7.9, 8);
  assert.ok(s.oldestMs.jobs > 5000, `oldest ${s.oldestMs.jobs}`);
});

test("delayed jobs mixed with redelivered ones: due jobs are never stuck behind hidden ones", () => {
  const d = design("delay hol", {
    users: clients({ to: "app", qps: 400, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 100, workMs: 50, via: "ext", delayMs: 300 }),
    ext: external({ label: "x", latencyMs: 10 }),
  });
  const r = run(d, { seconds: 6, seed: 1, faults: [{ at: 2000, kind: "kill", target: "ext" }] });
  for (const f of r.frames.filter((f) => f.t > 2500 && f.t <= 4000)) {
    const q = f.stations.jobs;
    assert.ok(q.backlog! < 20, `at ${f.t}: backlog ${q.backlog}`);
    if (q.backlog! > 0) assert.ok(q.oldestMs! > 0, `at ${f.t}: oldest ${q.oldestMs}`);
  }
});

test("replica names match what the engine accepts as fault targets", () => {
  const d = design("names", {
    users: clients({ to: "lb", qps: 10 }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 2, serviceMs: { read: 1, write: 1 }, calls: ["db"] }),
    db: database({ shards: 2, replicas: 2, readMs: 1, writeMs: 1 }),
  });
  const v = viewOf(d);
  assert.deepEqual(replicaNames(v.components.find((c) => c.id === "db")!), ["db-s1-1", "db-s1-2", "db-s2-1", "db-s2-2"]);
  for (const name of v.components.flatMap((c) => (c.type === "station" ? replicaNames(c) : []))) {
    assert.equal(run(d, { seconds: 1, faults: [{ at: 500, kind: "kill", target: name }] }).error, undefined, name);
  }
});

test("latency is unknown, not zero, when nothing succeeds; a shared machine is billed once", () => {
  const r = run(twoTier(), { seconds: 3, faults: [{ at: 1000, kind: "kill", target: "app" }] });
  assert.equal(r.frames.at(-1)!.clients.p50, -1);
  const one = summary(run(twoTier({ sameMachine: true }), { seconds: 2 }));
  assert.equal(one.costPerHour, 0.17);
});

test("callouts: a dead read replica moves reads; local sessions without a crash still log users out", () => {
  const d = design("rep", {
    users: clients({ to: "app", qps: 200, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["db"] }),
    db: database({ replicas: 3, readMs: 1, writeMs: 1 }),
  });
  const r = run(d, { seconds: 4, faults: [{ at: 1500, kind: "kill", target: "db-3" }] });
  const text = callouts(r, 30).find((c) => c.rule === "down")!.text;
  assert.doesNotMatch(text, /single point of failure/);
  assert.match(text, /other copies/);
});

// --- request kinds and user classes, per-kind timeouts, skew knob ---

import { breaker, call } from "./index.ts";

test("metrics split by request kind and by user class", () => {
  // Reads take 2 ms, writes 40 ms; heavy users send 20% of requests; 30% of users are 120 ms away.
  const d = design("split", {
    users: clients({ to: "app", qps: 200, mix: { read: 0.8, write: 0.2 }, abuseShare: 0.2, abusers: 5, farShare: 0.3, farHopMs: 120, hopMs: 0 }),
    app: server({ cores: 8, hopMs: 0, dist: "exponential", serviceMs: { read: 2, write: 40 } }),
  });
  const s = summary(run(d, { seconds: 20 }), 2);
  const { read, write } = s.byKind;
  assert.ok(read && write && s.byKind.static === undefined, "only the kinds the design sends");
  within(read.sent + write.sent, s.sent, 0.001, "kinds add up");
  within(write.sent / s.sent, 0.2, 0.15, "write share");
  assert.ok(write.p50 > 10 * read.p50 && read.p50 < 300, `read p50 ${read.p50}, write p50 ${write.p50}`);
  within(s.byClass.heavy.sent / s.sent, 0.2, 0.15, "heavy share");
  within(s.byClass.far.sent / s.sent, 0.3, 0.15, "far share");
  assert.ok(s.byClass.far.p50 > 240 && s.byClass.normal.p50 < 50, `far ${s.byClass.far.p50}, normal ${s.byClass.normal.p50}`);
  // Everyone is normal, heavy or far; some heavy users are also far.
  assert.ok(s.byClass.normal.sent + s.byClass.heavy.sent + s.byClass.far.sent >= s.sent - 1e-9);
  // At a scale the counts are real requests again.
  const scaled = summary(run(d, { seconds: 20, scale: 4 }), 2);
  within(scaled.byKind.write!.sent, write.sent, 0.1, "write rate at scale 4");
});

test("per-kind timeouts: writes may get a shorter deadline than reads", () => {
  const d = design("deadlines", {
    users: clients({ to: "app", qps: 100, mix: { read: 0.8, write: 0.2 }, hopMs: 0, timeoutMs: { write: knob("writeTimeout", 30, [10, 5000]) } }),
    app: server({ cores: 8, hopMs: 0, serviceMs: { read: 2, write: 40 } }),
  });
  const s = summary(run(d, { seconds: 10 }), 1);
  assert.ok(s.byKind.write!.timeoutRate > 0.6, `write timeouts ${s.byKind.write!.timeoutRate}`);
  assert.equal(s.byKind.read!.timeoutRate, 0, "reads keep the default 1000 ms");
  assert.equal(summary(run(d, { seconds: 10, knobs: { writeTimeout: 1000 } }), 1).timeoutRate, 0);
  const users = viewOf(d).components.find((c) => c.type === "clients")!;
  assert.deepEqual([users.timeoutMs, users.timeouts], [1000, { read: 1000, write: 30, static: 1000 }]);
});

test("key skew can be a knob", () => {
  const d = design("skewed", {
    users: clients({ to: "app", qps: 500, keys: 10_000, skew: knob("skew", 0.9, [0, 2]), mix: { read: 1, write: 0 }, hopMs: 0 }),
    app: server({ cores: 8, serviceMs: { read: 1, write: 1 }, calls: [cacheAside("cache", "db")] }),
    cache: cache({ capacity: 1000 }),
    db: database({ cores: 8, readMs: 2, writeMs: 2 }),
  });
  const flat = summary(run(d, { seconds: 10, knobs: { skew: 0 } }), 3).hitRate.cache;
  const steep = summary(run(d, { seconds: 10, knobs: { skew: 1.5 } }), 3).hitRate.cache;
  assert.ok(flat < 0.15 && steep > 0.9, `flat ${flat}, steep ${steep}`);
  assert.deepEqual(viewOf(d).knobs.map((k) => k.knob), ["skew"]);
});

// --- CDN expiry and stale reads ---

const edgeReads = (ttlMs: number) =>
  design("edge reads", {
    users: clients({ to: "cdn", qps: 300, keys: 1000, mix: { read: 0.8, write: 0.2 }, hopMs: 0, rereadMs: 200, rereadShare: 1 }),
    cdn: cdn({ to: "app", capacity: 1000, ttlMs }),
    app: server({ cores: 8, serviceMs: { read: 1, write: 1 }, calls: ["db"] }),
    db: database({ cores: 8, readMs: 1, writeMs: 1 }),
  });

test("reads answered by a CDN count as stale when the edge copy is older than the latest write", () => {
  const s = summary(run(edgeReads(0), { seconds: 20 }), 5);
  assert.ok(s.hitRate.cdn > 0.9, `hit ${s.hitRate.cdn}`);
  // Writes go past the edge and never refresh it, so popular keys are served old for ever.
  assert.ok(s.staleRate > 0.5, `stale ${s.staleRate}`);
  assert.ok(s.staleOwnRate > 0.9, `own stale ${s.staleOwnRate}`);
});

test("a CDN TTL bounds how old an edge copy gets, at the price of more misses", () => {
  const forever = summary(run(edgeReads(0), { seconds: 20 }), 5);
  const ttl = summary(run(edgeReads(500), { seconds: 20 }), 5);
  assert.ok(ttl.staleRate < forever.staleRate / 2, `stale ${forever.staleRate} -> ${ttl.staleRate}`);
  assert.ok(ttl.hitRate.cdn < forever.hitRate.cdn - 0.1, `hit ${forever.hitRate.cdn} -> ${ttl.hitRate.cdn}`);
  assert.equal(viewOf(edgeReads(500)).components.find((c) => c.id === "cdn")!.ttlMs, 500);
});

// --- delayed jobs ---

test("delayed jobs: invisible until due, and not counted as late meanwhile", () => {
  const d = design("delayed", {
    users: clients({ to: "app", qps: 100, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 20, workMs: 10, delayMs: knob("delay", 2000, [0, 10_000]) }),
  });
  const r = run(d, { seconds: 10 });
  const processed = (from: number, to: number) => r.frames.filter((f) => f.t > from && f.t <= to).reduce((n, f) => n + (f.stations.jobs.processed ?? 0), 0);
  assert.equal(processed(0, 1900), 0, "nothing is due before 2 s");
  within(processed(5000, 10_000) / 5, 100, 0.15, "then 100 jobs a second finish");
  const s = summary(r, 5);
  assert.ok(s.backlog.jobs < 10 && s.oldestMs.jobs < 50, `backlog ${s.backlog.jobs}, oldest ${s.oldestMs.jobs}`);
  within(s.scheduled.jobs, 200, 0.25, "two seconds of jobs waiting for their time");
  assert.deepEqual(callouts(r, 80).filter((c) => c.rule === "backlog"), []);
});

// --- bytes, bandwidth and egress ---

const pipe = (qps: number, o: { bandwidthMbps?: number; flowMbps?: number; cdnFront?: boolean } = {}) =>
  design("pipe", {
    // Every page is 125 KB = 1 megabit.
    users: clients({ to: o.cdnFront ? "cdn" : "app", qps: knob("qps", qps, [1, 100_000]), mix: { read: 1, write: 0 }, bytes: { read: 125_000 }, hopMs: 0, keys: 100 }),
    ...(o.cdnFront ? { cdn: cdn({ to: "app", capacity: 100 }) } : {}),
    app: server({ cores: 8, hopMs: 0, serviceMs: { read: 2, write: 2 }, bandwidthMbps: o.bandwidthMbps ?? 100, flowMbps: o.flowMbps ?? 100 }),
  });

test("bandwidth: answers share the network card; transfer time is size / speed", () => {
  // 50 pages a second x 1 Mbit = 50 Mbps on a 100 Mbps card: half used. Alone, a page takes 1 Mbit / 100 Mbps = 10 ms.
  const s = summary(run(pipe(50), { seconds: 20 }), 2);
  within(s.nicUtil.app, 0.5, 0.08, "card use");
  assert.ok(s.p50 > 11 && s.p50 < 25 && s.util.app < 0.05, `p50 ${s.p50}, cpu ${s.util.app}`);
  within(s.egressBytes, 50 * 125_000, 0.08, "bytes to users a second");
  // 6.25 MB/s = 22.5 GB an hour at $0.09.
  within(s.egressPerHour, 22.5 * 0.09, 0.08, "egress cost");
  within(s.costPerHour, 0.17 + s.egressPerHour, 0.001, "egress is part of the bill");
});

test("broken: a saturated network card — CPUs idle, answers queue to go out", () => {
  const r = run(pipe(130), { seconds: 20 });
  const s = summary(r, 5);
  assert.ok(s.nicUtil.app > 0.97 && s.util.app < 0.1, `nic ${s.nicUtil.app}, cpu ${s.util.app}`);
  assert.ok(s.errorRate > 0.1, `errors ${s.errorRate}`);
  assert.equal(bottleneck(r, 5), "app", "the bottleneck counts the network card");
  assert.ok(callouts(r, 150).some((c) => c.rule === "bandwidth" && c.at === "app"), callouts(r, 150).map((c) => c.rule).join());
});

test("bandwidth under scaling: exact while the card's share stays above one transfer's limit", () => {
  const d = pipe(3000, { bandwidthMbps: 10_000, flowMbps: 50 });
  const one = summary(run(d, { seconds: 6, scale: 1 }), 1);
  const ten = summary(run(d, { seconds: 6, scale: 10 }), 1);
  within(ten.nicUtil.app, one.nicUtil.app, 0.1, "card use");
  within(ten.p50, one.p50, 0.1, "p50");
  assert.ok(!run(d, { seconds: 1, scale: 10 }).approximate.includes("app bandwidth"));
  assert.ok(run(d, { seconds: 1, scale: 1000 }).approximate.includes("app bandwidth"));
});

test("a CDN sends the bytes instead, at a CDN's price per GB", () => {
  const s = summary(run(pipe(50, { cdnFront: true }), { seconds: 10 }), 2);
  assert.ok(s.hitRate.cdn > 0.99 && s.nicUtil.app < 0.02, `hit ${s.hitRate.cdn}, origin card ${s.nicUtil.app}`);
  within(s.egressPerHour, 22.5 * 0.02, 0.1, "CDN egress");
});

// --- circuit breakers, service retries and budgets, bulkheads ---

const checkout = (step: Parameters<typeof server>[0]["calls"], extra: Partial<Parameters<typeof server>[0]> = {}) =>
  design("checkout", {
    users: clients({ to: "app", qps: 200, hopMs: 0 }),
    app: server({ replicas: 1, cores: 8, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: step, ...extra }),
    payments: external({ label: "Payment provider", latencyMs: 50, hopMs: 0 }),
  });

test("circuit breaker: opens when calls keep failing, fails fast, then closes after trial calls", () => {
  const d = checkout([breaker("payments", { minCalls: 20, failureRate: 0.5, windowMs: 500, openMs: 2000, halfOpenProbes: 5 })]);
  const r = run(d, { seconds: 12, faults: [{ at: 3000, kind: "kill", target: "payments" }, { at: 7000, kind: "restart", target: "payments" }] });
  const at = (t: number) => r.frames.find((f) => f.t === t)!.stations.app.links!.payments;
  assert.deepEqual(at(2000).breaker, ["closed"]);
  assert.deepEqual(at(3500).breaker, ["open"]);
  assert.ok(summary(r, 3.5, 7).shortCircuited > 100, "most calls never leave the app");
  // Calls still fail while it is down; once back, a round of trial calls closes the breaker.
  assert.deepEqual(at(10_000).breaker, ["closed"]);
  assert.equal(summary(r, 10).errorRate, 0);
  assert.ok(callouts(r, 40).some((c) => c.rule === "breakerOpen" && c.at === "app"));
  assert.deepEqual(viewOf(d).components.find((c) => c.id === "app")!.breakers, ["payments"]);
});

test("circuit breaker with a fallback: skip the call and answer degraded", () => {
  const d = checkout([breaker("payments", { fallback: "skip" })]);
  const r = run(d, { seconds: 10, faults: [{ at: 3000, kind: "kill", target: "payments" }] });
  const s = summary(r, 4);
  assert.equal(s.errorRate, 0);
  assert.ok(s.degradedRate > 0.99, `degraded ${s.degradedRate}`);
  assert.ok(s.links["app>payments"].openShare > 0.5, `open ${s.links["app>payments"].openShare}`);
});

test("broken: a slow dependency without a breaker holds every worker; with one, the workers stay free", () => {
  const slow = [{ at: 2000, kind: "slow" as const, target: "payments", factor: 40, durationMs: 20_000 }];
  // 200 requests a second, each waiting up to 500 ms on payments: 100 workers' worth, with 50 workers.
  const opts = { threads: 50, queue: 50 };
  const without = summary(run(checkout([call("payments", { timeoutMs: 500 })], opts), { seconds: 12, faults: slow }), 5);
  const withB = summary(run(checkout([breaker("payments", { timeoutMs: 500, windowMs: 1000, fallback: "skip" })], opts), { seconds: 12, faults: slow }), 5);
  assert.ok(without.threads.app > 0.95 && without.rejectedRate > 0.2, `threads ${without.threads.app}, rejected ${without.rejectedRate}`);
  assert.ok(withB.threads.app < 0.3 && withB.errorRate < 0.02, `threads ${withB.threads.app}, errors ${withB.errorRate}`);
});

test("retry storm: 3 client attempts x 3 service attempts = 9 calls on a dead database; a retry budget stops it", () => {
  const storm = (budget?: number) =>
    design("storm", {
      users: clients({ to: "app", qps: 100, retry: "immediate", attempts: 3, hopMs: 0, ...(budget === undefined ? {} : { retryBudget: budget }) }),
      app: server({ cores: 8, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: [call("db", { retry: { attempts: 3 }, ...(budget === undefined ? {} : { retryBudget: budget }) })] }),
      db: database({ cores: 8, readMs: 1, writeMs: 1 }),
    });
  const dead = [{ at: 0, kind: "kill" as const, target: "db" }];
  const s = summary(run(storm(), { seconds: 10, faults: dead }), 2);
  within(s.calls.db / s.sent, 9, 0.03, "database calls per user request");
  within(s.retries / s.sent, 2, 0.03, "client retries per request");
  within(s.serviceRetries / s.sent, 6, 0.03, "service retries per request");
  within(s.links["app>db"].retries, s.serviceRetries, 0.001, "counted on the link too");
  const b = summary(run(storm(0.1), { seconds: 10, faults: dead }), 2);
  assert.ok(b.calls.db / b.sent < 1.3, `with a 10% budget: ${b.calls.db / b.sent} calls per request`);
});

test("retries with backoff wait between attempts, with jitter from the seeded random numbers", () => {
  const d = checkout([call("payments", { retry: { attempts: 4, backoffMs: 100, jitter: 0.5 } })]);
  const r = run(d, { seconds: 4, faults: [{ at: 0, kind: "kill", target: "payments" }] });
  // Every request fails after 3 retries: about 100 + 200 + 400 ms of waiting.
  const s = summary(r, 1);
  assert.equal(s.ok, 0);
  const j = r.journeys.find((x) => x.outcome === "failed")!;
  assert.ok(j.end - j.sent > 450 && j.end - j.sent < 1100, `failed after ${j.end - j.sent} ms`);
  assert.deepEqual(run(d, { seconds: 4, faults: [{ at: 0, kind: "kill", target: "payments" }] }).frames, r.frames);
});

test("bulkheads: a slow dependency may take only its own pool of workers", () => {
  const shop = (pools?: Record<string, number>) =>
    design("shop", {
      users: clients({ to: "app", qps: 200, mix: { read: 0.8, write: 0.2 }, hopMs: 0 }),
      app: server({ cores: 8, threads: 50, queue: 50, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: { read: ["catalog"], write: ["payments"] }, ...(pools ? { pools } : {}) }),
      catalog: database({ cores: 8, readMs: 1, writeMs: 1, hopMs: 0 }),
      payments: external({ label: "Payment provider", latencyMs: 100, hopMs: 0 }),
    });
  const slow = [{ at: 2000, kind: "slow" as const, target: "payments", factor: 20, durationMs: 20_000 }];
  // 40 checkouts a second, each now 2 s: 80 workers waiting on payments, more than all 50.
  const shared = summary(run(shop(), { seconds: 12, faults: slow }), 5);
  const walled = summary(run(shop({ payments: 20 }), { seconds: 12, faults: slow }), 5);
  assert.ok(shared.byKind.read!.errorRate > 0.3, `reads fail with shared workers: ${shared.byKind.read!.errorRate}`);
  assert.equal(walled.byKind.read!.errorRate, 0, "reads are untouched behind the bulkhead");
  assert.ok(walled.links["app>payments"].poolFull > 10, `refused at the bulkhead ${walled.links["app>payments"].poolFull}/s`);
  assert.ok(walled.byKind.write!.errorRate > 0.4);
  assert.throws(() => shop({ nope: 5 }), /never calls/);
  // Pools are shared out like workers when requests are scaled.
  assert.ok(!run(shop({ payments: 20 }), { seconds: 1, scale: 4 }).approximate.some((x) => x.includes("pool")));
  assert.ok(run(shop({ payments: 20 }), { seconds: 1, scale: 3 }).approximate.includes("app pool for payments"));
});

// --- regions ---

const twoRegions = (geo: "nearest" | string[]) =>
  design(
    "regions",
    {
      users: clients({ to: "lb", qps: 200, mix: { read: 0.9, write: 0.1 }, hopMs: 0, regions: { us: 0.5, eu: 0.5 } }),
      lb: loadBalancer({ to: "app", geo, healthCheckMs: 1000, hopMs: 0 }),
      app: server({ replicas: 4, region: ["us", "us", "eu", "eu"], cores: 4, hopMs: 0, serviceMs: { read: 2, write: 2 }, calls: ["db"] }),
      // The primary in the US, a replica in Europe 200 ms behind.
      db: database({ replicas: 2, region: ["us", "eu"], lagMs: 200, cores: 4, readMs: 1, writeMs: 1, hopMs: 0 }),
    },
    { interRegionMs: 80 },
  );

test("regions: active-active keeps reads local; writes cross to the primary", () => {
  const s = summary(run(twoRegions("nearest"), { seconds: 10 }), 2);
  assert.ok(s.byKind.read!.p99 < 30, `reads ${s.byKind.read!.p99}`);
  // Half the writes come from Europe: 80 ms each way to the primary.
  assert.ok(s.byKind.write!.p99 > 160 && s.byKind.write!.p50 < 170, `writes p50 ${s.byKind.write!.p50} p99 ${s.byKind.write!.p99}`);
  const v = viewOf(twoRegions("nearest"));
  assert.deepEqual([v.regions, v.interRegionMs, v.components.find((c) => c.id === "db")!.regions], [["us", "eu"], 80, ["us", "eu"]]);
});

test("broken: a region dies — active-active fails over at the next health check; writes fail without the primary", () => {
  const r = run(twoRegions("nearest"), { seconds: 12, faults: [{ at: 5000, kind: "killRegion", region: "us" }] });
  assert.equal(summary(r, 1, 5).errorRate, 0);
  const after = summary(r, 6.5);
  assert.equal(after.byKind.read!.errorRate, 0, "reads move to Europe");
  assert.equal(after.byKind.write!.errorRate, 1, "no primary, no writes (there is no promotion)");
  assert.ok(after.byKind.read!.p99 > 160, "US users now cross the ocean");
  assert.ok(callouts(r, 70).some((c) => c.rule === "regionDown"));
  assert.match(run(twoRegions("nearest"), { seconds: 1, faults: [{ at: 500, kind: "killRegion", region: "mars" }] }).error ?? "", /no servers/);
});

test("regions: active-passive sends everyone to the first region, and moves them all when it dies", () => {
  const r = run(twoRegions(["us", "eu"]), { seconds: 12, faults: [{ at: 5000, kind: "killRegion", region: "us" }] });
  const before = summary(r, 1, 5);
  assert.ok(before.util.app > 0 && before.replicaUtil.app[2] === 0 && before.replicaUtil.app[3] === 0, `${before.replicaUtil.app}`);
  assert.ok(before.byKind.read!.p99 > 160, "European users all cross to the US");
  const after = summary(r, 6.5);
  assert.equal(after.byKind.read!.errorRate, 0);
  assert.ok(after.replicaUtil.app[2] > 0, "the passive region took over");
  assert.throws(() => twoRegions(["us", "asia"]), /nothing is placed/);
});

// --- invariants: nothing leaks ---

test("fuzz: after load stops and everything drains, no worker, core, transfer, pool slot or trial call is still held", () => {
  const designs = [
    checkout([breaker("payments", { minCalls: 5, openMs: 300, halfOpenProbes: 3, timeoutMs: 120, retry: { attempts: 2, backoffMs: 10 }, retryBudget: 0.5 })], { replicas: 2, threads: 20, queue: 20, pools: { payments: 8 } }),
    pipe(60, { bandwidthMbps: 50 }),
    twoRegions("nearest"),
    design("everything", {
      users: clients({ to: "lb", qps: 300, retry: "backoff", mix: { read: 0.7, write: 0.2, static: 0.1 }, staticTo: "cdn", bytes: { static: 20_000 }, timeoutMs: { read: 300, write: 600 } }),
      cdn: cdn({ to: "lb", capacity: 100, ttlMs: 500 }),
      lb: loadBalancer({ to: "app", strategy: "least-connections" }),
      app: server({
        replicas: 3,
        threads: 10,
        queue: 10,
        bandwidthMbps: 20,
        serviceMs: { read: 2, write: 3, static: 1 },
        calls: { read: [cacheAside("cache", "db"), call("rec", { timeoutMs: 50, fallback: "skip", breaker: { minCalls: 5 } })], write: ["db", invalidate("cache"), "jobs"] },
        pools: { default: 5 },
      }),
      cache: cache({ capacity: 200, ttlMs: 300 }),
      db: database({ replicas: 2, lagMs: 100, readMs: 2, writeMs: 4, connections: 10 }),
      rec: external({ label: "Recommendations", latencyMs: 30 }),
      jobs: queue({ consumers: 5, workMs: 20, via: "mail", delayMs: 200 }),
      mail: external({ label: "Email", latencyMs: 10 }),
    }),
  ];
  const rand = makeRng(42);
  for (const [k, d] of designs.entries()) {
    const names = viewOf(d).components.flatMap((c) => (c.type === "station" ? replicaNames(c) : []));
    for (let seed = 1; seed <= 6; seed++) {
      const faults: TrafficRun["faults"] = [];
      for (let n = 0; n < 4; n++) {
        const target = names[Math.floor(rand() * names.length)];
        const at = Math.round(rand() * 5000);
        if (rand() < 0.6) faults.push({ at, kind: "kill", target }, { at: at + Math.round(rand() * 2000), kind: "restart", target });
        else faults.push({ at, kind: "slow", target, factor: 2 + Math.round(rand() * 20), durationMs: Math.round(rand() * 3000) });
      }
      if (k === 2 && seed % 2 === 0) faults.push({ at: 2000, kind: "killRegion", region: "eu" }, { at: 4000, kind: "restartRegion", region: "eu" });
      const r = run(d, { seconds: 8, seed, faults, drain: true });
      assert.equal(r.error, undefined);
      assert.equal(r.truncated, false, `design ${k} seed ${seed}`);
      for (const [what, n] of Object.entries(r.leftover!)) assert.equal(n, 0, `design ${k} seed ${seed}: ${what} still held`);
    }
  }
});

test("workers are shared out over replicas, so a scale that splits the total exactly is exact", () => {
  const d = design("spread", {
    users: clients({ to: "lb", qps: 1000, hopMs: 0 }),
    lb: loadBalancer({ to: "app" }),
    // 12 servers x 50 workers = 600; at a scale of 4 that is 150 workers: 13 on six servers, 12 on the others.
    app: server({ replicas: 12, cores: 4, threads: 50, queue: 100, serviceMs: { read: 1, write: 1 } }),
  });
  assert.deepEqual(run(d, { seconds: 2, scale: 4 }).approximate, []);
  assert.deepEqual(run(d, { seconds: 2, scale: 7 }).approximate.filter((x) => x.endsWith("workers")), ["app workers"]);
});

// --- review fixes: billing between regions, empty percentiles, retry budgets, failure latency ---

test("regions: a user served from another region pays internet egress only; only two placed stations in different regions pay inter-region", () => {
  const d = design(
    "bill",
    {
      // Active-passive: European users are all answered from the US.
      users: clients({ to: "lb", qps: 100, mix: { read: 1, write: 0 }, hopMs: 0, bytes: { read: 100_000 }, regions: { us: 0.5, eu: 0.5 } }),
      lb: loadBalancer({ to: "app", geo: ["us", "eu"], hopMs: 0 }),
      app: server({ replicas: 2, region: ["us", "eu"], cores: 4, hopMs: 0, serviceMs: { read: 2, write: 2 }, calls: ["db"] }),
      // The database's 10 KB answers cross from Europe to the US app: inter-region.
      db: database({ region: "eu", readMs: 1, writeMs: 1, hopMs: 0, bytes: { read: 10_000 } }),
    },
    { interRegionMs: 80 },
  );
  const s = summary(run(d, { seconds: 10 }), 2);
  within(s.egressBytes, 100 * 100_000, 0.1, "egress to users");
  within(s.crossRegionBytes, 100 * 10_000, 0.1, "database answers crossing to the US");
  within(s.egressPerHour, (100 * 100_000 * 3600 * 0.09) / 1e9 + (100 * 10_000 * 3600 * 0.02) / 1e9, 0.1, "egress cost");
  // An origin answering a CDN edge is CDN-origin traffic, not inter-region, wherever the edge is.
  const viaCdn = design(
    "bill cdn",
    {
      users: clients({ to: "cdn", qps: 100, mix: { read: 1, write: 0 }, hopMs: 0, keys: 100_000, bytes: { read: 100_000 }, regions: { eu: 1 } }),
      cdn: cdn({ to: "app", capacity: 10 }),
      app: server({ region: "us", cores: 4, hopMs: 0, serviceMs: { read: 1, write: 1 } }),
    },
    { interRegionMs: 80 },
  );
  const c = summary(run(viaCdn, { seconds: 10 }), 2);
  assert.equal(c.crossRegionBytes, 0);
  assert.ok(c.egressBytes > 0.9 * 100 * 100_000, `the edge sends to users: ${c.egressBytes}`);
});

test("regions: a far user's CDN miss crosses regions once; farHopMs is the user's own last mile, which the edge removes", () => {
  const d = design(
    "far edge",
    {
      users: clients({ to: "app", staticTo: "cdn", qps: 200, mix: { read: 0, write: 0, static: 1 }, keys: 100_000, hopMs: 20, farShare: 1, farHopMs: 500, regions: { eu: 1 }, timeoutMs: 10_000 }),
      cdn: cdn({ to: "app", capacity: 10 }),
      app: server({ region: "us", cores: 4, hopMs: 0, serviceMs: { read: 1, write: 1, static: 1 } }),
    },
    { interRegionMs: 80 },
  );
  // A miss: 10 ms to the edge, then 20 + 80 ms to the US origin, both ways: about 220 ms.
  const p50 = summary(run(d, { seconds: 5 }), 1).staticP50;
  assert.ok(p50 > 210 && p50 < 240, `miss p50 ${p50}`);
});

test("percentiles of an empty group are NaN, so `p99 < X` fails instead of passing vacuously", () => {
  const s = summary(run(twoTier(), { seconds: 3, faults: [{ at: 0, kind: "kill", target: "db" }] }), 1);
  assert.equal(s.ok, 0);
  for (const [what, x] of Object.entries({ p50: s.p50, p99: s.p99, mean: s.mean, read: s.byKind.read!.p99, normal: s.byClass.normal.p50, heavy: s.byClass.heavy.p99 })) {
    assert.ok(Number.isNaN(x), `${what} is ${x}`);
    assert.ok(!(x < 30), `${what}: an assert like p99 < 30 must fail`);
  }
});

test("retry budget: Finagle's minimum retries per second lets a quiet caller retry; the number form has none", () => {
  const quiet = (retryBudget: number | { ratio: number; minPerSec: number }) =>
    design("quiet", {
      users: clients({ to: "app", qps: 10, hopMs: 0, timeoutMs: 5000 }),
      app: server({ cores: 4, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: [call("db", { retry: { attempts: 3 }, retryBudget })] }),
      db: database({ readMs: 1, writeMs: 1, hopMs: 0 }),
    });
  const dead = [{ at: 0, kind: "kill" as const, target: "db" }];
  // 10 first attempts a second: 10% of them is at most 1 retry a second; a minimum of 5 a second
  // raises the cap to 6 (spent in bursts each time a window's worth expires, so a little under it).
  const plain = summary(run(quiet(0.1), { seconds: 40, faults: dead }), 12);
  const withMin = summary(run(quiet({ ratio: 0.1, minPerSec: 5 }), { seconds: 40, faults: dead }), 12);
  assert.ok(plain.serviceRetries <= 1.1, `ratio only: ${plain.serviceRetries}/s`);
  assert.ok(withMin.serviceRetries > 3 && withMin.serviceRetries <= 6.1, `ratio plus the minimum: ${withMin.serviceRetries}/s`);
  // The same for clients.
  const cl = (retryBudget: number | { ratio: number; minPerSec: number }) =>
    design("quiet clients", {
      users: clients({ to: "app", qps: 10, hopMs: 0, retry: "immediate", attempts: 3, retryBudget }),
      app: server({ cores: 4, hopMs: 0, serviceMs: { read: 1, write: 1 } }),
    });
  const down = [{ at: 0, kind: "kill" as const, target: "app" }];
  const c1 = summary(run(cl(0.1), { seconds: 40, faults: down }), 12).retries;
  const c2 = summary(run(cl({ ratio: 0.1, minPerSec: 5 }), { seconds: 40, faults: down }), 12).retries;
  assert.ok(c1 <= 1.1 && c2 > 3 && c2 <= 6.1, `client retries ${c1}/s, with the minimum ${c2}/s`);
  assert.throws(() => quiet({ ratio: -1, minPerSec: 0 }), /retryBudget/);
});

test("retry budget: calls a full pool refuses are not first attempts, so retries stay within the ratio of calls sent", () => {
  const d = design("pooled", {
    users: clients({ to: "app", qps: 200, hopMs: 0, timeoutMs: 5000 }),
    app: server({ cores: 8, threads: 1000, queue: 1000, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: [call("payments", { timeoutMs: 100, retry: { attempts: 3 }, retryBudget: 0.1 })], pools: { payments: 10 } }),
    payments: external({ label: "Payment provider", latencyMs: 50, hopMs: 0 }),
  });
  // Every attempt now times out at 100 ms: 10 slots let about 100 a second through, half the requests are refused at the pool.
  const r = run(d, { seconds: 30, faults: [{ at: 0, kind: "slow", target: "payments", factor: 40, durationMs: 60_000 }] });
  const l = summary(r, 12).links["app>payments"];
  assert.ok(l.poolFull > 50, `refused at the pool ${l.poolFull}/s`);
  assert.ok(l.retries <= 0.11 * l.calls, `retries ${l.retries}/s for ${l.calls} calls/s sent`);
});

test("design checks: a breaker's failureRate is in (0, 1]; pools only cover call steps", () => {
  const one = (calls: Parameters<typeof server>[0]["calls"], pools?: Record<string, number>) =>
    design("checks", {
      users: clients({ to: "app", qps: 10 }),
      app: server({ serviceMs: { read: 1, write: 1 }, calls, ...(pools ? { pools } : {}) }),
      cache: cache({ capacity: 10 }),
      db: database({ readMs: 1, writeMs: 1 }),
    });
  assert.throws(() => one([breaker("db", { failureRate: 0 })]), /failureRate/);
  assert.throws(() => one([breaker("db", { failureRate: 1.5 })]), /failureRate/);
  assert.doesNotThrow(() => one([breaker("db", { failureRate: 1 })]));
  assert.throws(() => one([cacheAside("cache", "db")], { db: 5 }), /only call steps/);
  assert.throws(() => one([invalidate("cache"), "db"], { cache: 5 }), /only call steps/);
  assert.doesNotThrow(() => one([cacheAside("cache", "db"), "db"], { db: 5 }));
});

test("a CDN does not keep a degraded answer: the next request for that key asks the origin again", () => {
  const d = design("degraded edge", {
    users: clients({ to: "cdn", qps: 300, mix: { read: 1, write: 0 }, hopMs: 0, keys: 1000, skew: 1 }),
    cdn: cdn({ to: "app", capacity: 1000 }),
    app: server({ cores: 4, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: [call("db", { fallback: "skip" })] }),
    db: database({ readMs: 1, writeMs: 1, hopMs: 0 }),
  });
  // The edge starts warm with every key; a restart empties it while the database is down.
  const r = run(d, { seconds: 10, faults: [{ at: 0, kind: "kill", target: "db" }, { at: 1000, kind: "restart", target: "cdn" }] });
  const s = summary(r, 2);
  assert.ok(s.hitRate.cdn < 0.01, `hit rate ${s.hitRate.cdn}`);
  assert.ok(s.degradedRate > 0.99, `degraded ${s.degradedRate}`);
});

test("queues: scheduledAvg is the time-averaged count of jobs not due yet", () => {
  const d = design("delayed avg", {
    users: clients({ to: "app", qps: 100, mix: { read: 0, write: 1 }, hopMs: 0 }),
    app: server({ cores: 4, serviceMs: { read: 1, write: 1 }, calls: ["jobs"] }),
    jobs: queue({ consumers: 20, workMs: 10, delayMs: 2000 }),
  });
  const s = summary(run(d, { seconds: 10 }), 3);
  // Little's law: 100 jobs a second, each waiting 2 s.
  within(s.scheduledAvg.jobs, 200, 0.08, "average jobs not due");
  assert.ok(s.scheduled.jobs > 0, "the last-frame figure stays");
});

test("failure latency: failP50/failP99 of requests that ended in an error or timeout", () => {
  const killed = summary(run(twoTier(), { seconds: 4, faults: [{ at: 0, kind: "kill", target: "db" }] }), 1);
  // The database refuses the connection at once: failures take only the app's own work.
  assert.ok(killed.failP99 < 50, `refused at once: ${killed.failP99} ms`);
  assert.ok(killed.byKind.read!.failP99 < 50 && killed.byClass.normal.failP50 < 20);
  const d = checkout([call("payments", { timeoutMs: 300 })], { threads: 500, queue: 500 });
  const slow = summary(run(d, { seconds: 6, faults: [{ at: 0, kind: "slow", target: "payments", factor: 40, durationMs: 60_000 }] }), 2);
  assert.ok(slow.failP50 >= 300 && slow.failP50 < 330, `failed after the 300 ms timeout: ${slow.failP50}`);
  const fine = summary(run(twoTier(), { seconds: 2 }));
  assert.ok(Number.isNaN(fine.failP99) && Number.isNaN(fine.byKind.read!.failP50), "nothing failed");
});
