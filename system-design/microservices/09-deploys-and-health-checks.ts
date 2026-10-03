/**
 * 09. Deploys and Health Checks
 * Level: Senior
 * Group: Microservices
 *
 * Problem: Every deploy of a service replaces its machines with new ones running the new
 *   version. Services deploy many times a day, often at busy hours. While a machine is being
 *   replaced it serves nothing, and when it comes back its memory is empty. How do you deploy
 *   without users noticing?
 *
 * Approach: Replace one machine at a time, notice quickly, and keep a spare
 *   1. A rolling deploy at peak with no spare capacity and a 5 s health check: the load balancer
 *   keeps sending a quarter of requests to each stopped machine for seconds, then ignores the
 *   new one for seconds more while three machines run flat out; each new machine's empty cache
 *   sends its share of reads to the database. 2. A 1 s health check: far fewer requests go to a
 *   dead machine, but three machines still cannot carry peak traffic (off-peak they can). 3. One
 *   spare machine (N+1): losing any one leaves enough, and only the moment before the health
 *   check notices costs anything.
 *
 * Cost: four machines run ~80% busy at peak for ~$1.65 an hour. Deploying them with 5 s checks
 *   fails ~13% of requests over the deploy; with 1 s checks ~4%, and pages take ~230 ms while
 *   three machines carry the load. Five machines (~$1.97) keep pages at ~14 ms and fail ~1.5%,
 *   all in the half second before each health check. After the deploy the cache answers ~62% of
 *   reads instead of ~87%, and the database is more than twice as busy.
 *
 * Pattern: rolling deploy, health checks, N+1 capacity
 * Key insight: A deploy is a planned failure of every machine in turn. Size the service so it
 *   survives losing one machine at peak (N+1), drain each machine before stopping it, so the load
 *   balancer never has to discover the stop; fast health checks are the backstop for machines
 *   that die unplanned. Expect each new machine to start cold.
 * Tradeoffs: N+1 costs one idle machine per service, all the time (for deploys alone, surging,
 *   starting the new machine before stopping the old, gives headroom without a permanent spare). Faster health checks add a
 *   little load and can mark a machine dead after one slow answer; real load balancers wait for
 *   several failed checks in a row.
 * Staff notes: Take a machine out of the load balancer before stopping it, and let it finish
 *   its requests (connection draining); this simulator stops machines abruptly, so it shows the
 *   cost of not draining. Deploy off-peak or in small steps when you have no headroom, and watch
 *   the database during a deploy: cold caches move load onto it.
 * Interview signals: "zero-downtime deploy", "rolling update", "blue-green", "canary",
 *   "readiness probe", "N+1", "deploy caused an outage".
 * Real world: Kubernetes rolling updates replace pods a few at a time (maxUnavailable,
 *   maxSurge) and only route traffic to pods whose readiness probe passes. AWS load balancers
 *   mark a target unhealthy after a configurable number of failed checks and drain connections
 *   (deregistration delay) before removing it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheAside, cache, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// A product page service at its daily peak: 2,000 page reads a second, from our own edge.
const users = () => clients({ to: "lb", qps: knob("qps", 2000, [100, 4000]), mix: { read: 1, write: 0 }, hopMs: 1 });

// Each app machine also runs one shard of the shared cache (a cache process on the same host),
// so replacing the machine empties that shard. The database answers the cache's misses.
const tier = (replicas: number, healthCheckMs: number) => ({
  users: users(),
  lb: loadBalancer({ to: "app", healthCheckMs }),
  app: server({ label: "Product pages", replicas, cores: 4, serviceMs: { read: 6.5, write: 6.5 }, calls: [cacheAside("cache", "db")] }),
  cache: cache({ label: "Cache shards", replicas, capacity: 20_000 }),
  db: database({ cores: 4, readMs: 3, writeMs: 5 }),
});

// @why Stage 1: four machines, ~80% busy at peak, and a health check every 5 s.
export const noSpare = design("1. Rolling deploy at peak", tier(4, 5000));

// @why Stage 2: the same four machines, checked every second.
export const fastChecks = design("2. Health checks every second", tier(4, 1000));

// @why Stage 3: five machines, ~65% busy at peak, so any four can carry it.
export const spare = design("3. One spare machine (N+1)", tier(5, 1000));

// --- helpers for the scenarios ---

/**
 * A rolling deploy: every `everyMs`, stop one machine (and the cache shard on it) and start it
 * again `bootMs` later with the new version: empty memory, cold cache.
 */
function rollingDeploy(replicas: number, { startMs = 2500, everyMs = 6000, bootMs = 4000 } = {}) {
  return Array.from({ length: replicas }, (_, i) => {
    const at = startMs + i * everyMs;
    const names = [`app-${i + 1}`, `cache-${i + 1}`];
    return [...names.map((target) => ({ at, kind: "kill" as const, target })), ...names.map((target) => ({ at: at + bootMs, kind: "restart" as const, target }))];
  }).flat();
}

// Machine i is stopped at 2.5 s + 6 s x i and back, empty, 4 s later; run until 3.5 s after the last.
const deploy = (replicas: number) => ({ seconds: 2.5 + 6 * (replicas - 1) + 7.5, seed: 1, faults: rollingDeploy(replicas) });

test("peak, no deploy: four machines about 80% busy, 87% of reads from the cache", () => {
  const s = summary(run(noSpare, { seconds: 8, seed: 1 }), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 11 && s.p50 < 14, `p50 ${s.p50}`);
  assert.ok(s.util.app > 0.77 && s.util.app < 0.83, `app ${s.util.app}`);
  assert.ok(s.hitRate.cache > 0.84 && s.hitRate.cache < 0.9, `hit ${s.hitRate.cache}`);
  assert.ok(s.util.db > 0.17 && s.util.db < 0.25, `db ${s.util.db}`);
  assert.ok(Math.abs(s.costPerHour - 1.65) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: rolling deploy at peak with 5 s health checks", () => {
  const r = run(noSpare, deploy(4));
  // Machine 1 stops at 2.5 s; the load balancer keeps sending it a quarter of requests until its check at 5 s.
  const blind = summary(r, 2.6, 5);
  assert.ok(blind.failedRate > 0.22 && blind.failedRate < 0.28, `failed ${blind.failedRate}`);
  // It is back at 6.5 s, but unseen until the check at 10 s: three machines carry peak traffic.
  const unseen = summary(r, 7, 8.5);
  assert.ok(unseen.p50 > 180 && unseen.p50 < 240, `p50 ${unseen.p50}`);
  assert.ok(unseen.util.app > 0.74, `app ${unseen.util.app}`);
  assert.ok(unseen.rejectedRate > 0.04 && unseen.rejectedRate < 0.11, `rejected ${unseen.rejectedRate}`);
  const all = summary(r, 2.5);
  assert.ok(all.errorRate > 0.1 && all.errorRate < 0.16, `errors over the deploy ${all.errorRate}`);
});

test("broken: 1 s health checks at peak — three machines cannot carry it", () => {
  const r = run(fastChecks, deploy(4));
  // Half a second until the check at 3 s notices machine 1 is gone.
  const blind = summary(r, 2.5, 3);
  assert.ok(blind.failedRate > 0.2 && blind.failedRate < 0.3, `failed ${blind.failedRate}`);
  // Then three machines at full CPU for the 4 s it takes the new one to start: queues, slow pages, refusals.
  const short = summary(r, 4, 6.5);
  assert.ok(short.p50 > 190 && short.p50 < 270, `p50 ${short.p50}`);
  assert.ok(short.rejectedRate > 0.05 && short.rejectedRate < 0.11, `rejected ${short.rejectedRate}`);
  const all = summary(r, 2.5);
  assert.ok(all.errorRate > 0.03 && all.errorRate < 0.06, `errors over the deploy ${all.errorRate}`);
});

test("1 s health checks off-peak: the same deploy at 1,200 reads a second", () => {
  const r = run(fastChecks, { ...deploy(4), knobs: { qps: 1200 } });
  // Three machines are enough for 1,200 a second: no queueing while one is away.
  const short = summary(r, 3.1, 6.5);
  assert.equal(short.errorRate, 0);
  assert.ok(short.p50 > 11 && short.p50 < 16, `p50 ${short.p50}`);
  // Only the half second before each health check still fails a quarter of requests.
  const all = summary(r, 2.5);
  assert.ok(all.errorRate > 0.01 && all.errorRate < 0.03, `errors over the deploy ${all.errorRate}`);
});

test("N+1 at peak: errors only before each health check, pages stay fast", () => {
  const r = run(spare, deploy(5));
  const before = summary(r, 0.5, 2.5);
  assert.ok(before.util.app > 0.6 && before.util.app < 0.7, `app ${before.util.app}`);
  assert.ok(Math.abs(before.costPerHour - 1.97) < 0.02, `cost ${before.costPerHour}`);
  // A fifth of requests go to the stopped machine until the check at 3 s.
  const blind = summary(r, 2.5, 3);
  assert.ok(blind.failedRate > 0.15 && blind.failedRate < 0.25, `failed ${blind.failedRate}`);
  // Four machines carry peak traffic while the fifth is replaced.
  const short = summary(r, 3.1, 6.5);
  assert.equal(short.errorRate, 0);
  assert.ok(short.p50 > 11 && short.p50 < 17, `p50 ${short.p50}`);
  const all = summary(r, 2.5);
  assert.ok(all.errorRate > 0.01 && all.errorRate < 0.02, `errors over the deploy ${all.errorRate}`);
  assert.ok(all.p99 < 50, `p99 ${all.p99}`);
});

test("N+1 at peak: after the deploy the cache is still refilling, and the database carries the difference", () => {
  const r = run(spare, deploy(5));
  const before = summary(r, 0.5, 2.5);
  const after = summary(r, 31, 34);
  assert.ok(before.hitRate.cache > 0.85 && before.hitRate.cache < 0.89, `hit before ${before.hitRate.cache}`);
  assert.ok(after.hitRate.cache > 0.56 && after.hitRate.cache < 0.68, `hit after ${after.hitRate.cache}`);
  assert.ok(after.util.db > 2 * before.util.db, `db ${before.util.db} -> ${after.util.db}`);
});
