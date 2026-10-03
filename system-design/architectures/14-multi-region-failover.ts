/**
 * 14. Multi-Region Failover
 * Level: Staff
 * Group: Architectures
 *
 * Problem: The whole product runs in one cloud region. Regions do fail: a power or network
 *   event, a bad configuration pushed everywhere at once. When it happens, everything is down
 *   until the region returns. Users on the other side of the ocean also pay a round trip across
 *   it on every request. How much of this can a second region fix, and what does it cost?
 *
 * Approach: Add a second region, then decide what it is allowed to do
 *   1. One region: fine until it fails, then nothing works. 2. Active-passive: a standby region
 *   with a copy of the database that trails the primary; when the main region dies, traffic
 *   moves at the next health check, reads work again, but writes fail until someone promotes
 *   the copy, and writes not yet copied are lost. 3. Active-active reads: each region serves its
 *   own users' reads from a local copy; writes still go to the one primary.
 *
 * Cost: one region: ~$1.39 an hour, European users wait an extra ~80 ms on every request, and
 *   a region failure is a total outage. Active-passive: ~$2.07 for a standby that does nothing
 *   until the failure; then requests fail until the next health check (up to 3 s here) and
 *   every write fails until promotion. Active-active: the same machines, every read local
 *   (read p99 under 40 ms instead of ~114), but European writes still cross the ocean, ~40% of
 *   reloads right after a save miss it (replica lag), and losing the primary's region still
 *   stops writes.
 *
 * Pattern: active-passive failover, active-active reads, asynchronous cross-region replication
 * Key insight: Failover has two numbers. RTO (how long until it works again) is set by how
 *   fast you detect the failure and move traffic, and for writes by how fast you promote a new
 *   primary. RPO (how much data you lose) is set by replication lag: with asynchronous copying,
 *   every write the other region had not received yet is gone. A second region you never send
 *   traffic to is a second region you do not know works.
 * Tradeoffs: Synchronous replication to the other region makes RPO zero but adds a round trip
 *   across the ocean to every write. Active-active writes (each region a primary) remove that,
 *   but two regions can then change the same record at once and must resolve the conflict.
 * Staff notes: Write down the RTO and RPO the business needs before choosing; they decide the
 *   design and the bill. Rehearse failover regularly, in production, because an untested
 *   standby usually has a missing setting, a stale certificate or too little capacity. Make
 *   promotion a decision with a runbook (who decides, how to stop the old primary from coming
 *   back as a second primary).
 * Interview signals: "disaster recovery", "multi-region", "RTO / RPO", "active-active",
 *   "active-passive", "what if us-east-1 goes down", "global users", "data residency".
 * Real world: AWS publishes post-event summaries of region-wide events (for example us-east-1
 *   in December 2021). Amazon Aurora Global Database and Google Cloud Spanner offer
 *   cross-region replicas; Aurora's are asynchronous with typical lag under a second, Spanner
 *   commits writes by quorum across replicas. Route 53 and other DNS services do health-checked
 *   failover between regions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, loadBalancer, run, server, summary } from "../traffic/index.ts";

// 1,000 requests a second: 90% reads, 10% writes. 60% of users are in the US, 40% in Europe,
// each 10 ms from the nearest region. Between the regions: 40 ms each way, roughly the US east
// coast to western Europe. 10% of users who save something reload the page 200 ms later.
const users = () =>
  clients({ to: "lb", qps: 1000, mix: { read: 0.9, write: 0.1 }, hopMs: 10, regions: { us: 0.6, eu: 0.4 }, rereadMs: 200, rereadShare: 0.1 });
// A page costs 4 ms of app CPU; the database 1 ms a read, 3 ms a write.
const app = (region: string | string[], replicas: number) =>
  server({ replicas, region, cores: 4, serviceMs: { read: 4, write: 4 }, calls: ["db"] });
const OPTS = { interRegionMs: 40 };
// Every 3 s the global load balancer (or health-checked DNS) checks each region. In real systems
// detecting a region failure and moving traffic takes longer: a few failed checks, plus DNS caching.
const HEALTH_MS = 3000;

// @why Stage 1: everything in one region (us). The database has a standby copy in the same
// @why region for when one machine fails, but nothing outside it.
export const oneRegion = design(
  "1. One region",
  {
    users: users(),
    lb: loadBalancer({ to: "app", healthCheckMs: HEALTH_MS }),
    app: app("us", 4),
    db: database({ replicas: 2, region: "us", lagMs: 10, cores: 4, readMs: 1, writeMs: 3 }),
  },
  OPTS,
);

// @why Stage 2: a standby region (eu) with its own app servers and a copy of the database that
// @why trails the primary by about 300 ms (asynchronous replication). Everyone is sent to the US;
// @why if no US server answers the health check, everyone is sent to Europe instead.
export const activePassive = design(
  "2. Active-passive: a standby region",
  {
    users: users(),
    lb: loadBalancer({ to: "app", geo: ["us", "eu"], healthCheckMs: HEALTH_MS }),
    app: app(["us", "us", "us", "us", "eu", "eu", "eu", "eu"], 8),
    db: database({ replicas: 2, region: ["us", "eu"], lagMs: 300, cores: 4, readMs: 1, writeMs: 3 }),
  },
  OPTS,
);

// @why After someone promotes Europe's copy to primary, with the US still down. The simulator
// @why cannot promote a database during a run, so this is its own design: Europe alone.
export const promoted = design(
  "2. Europe promoted, the US still down",
  {
    users: users(),
    lb: loadBalancer({ to: "app", healthCheckMs: HEALTH_MS }),
    app: app("eu", 4),
    db: database({ region: "eu", cores: 4, readMs: 1, writeMs: 3 }),
  },
  OPTS,
);

// @why Stage 3: both regions serve. Each user goes to their own region; reads use the local copy
// @why of the database. Writes still go to the one primary, in the US.
const activeActive = (readYourWrites: boolean, name: string) =>
  design(
    name,
    {
      users: users(),
      lb: loadBalancer({ to: "app", geo: "nearest", healthCheckMs: HEALTH_MS }),
      app: app(["us", "us", "us", "us", "eu", "eu", "eu", "eu"], 8),
      db: database({ replicas: 2, region: ["us", "eu"], lagMs: 300, readYourWrites, cores: 4, readMs: 1, writeMs: 3 }),
    },
    OPTS,
  );
export const activeActiveReads = activeActive(false, "3. Active-active reads");
// @why The same, but for a second after a user's own write, their reads go to the primary.
export const readYourWrites = activeActive(true, "3. Active-active, read your own writes");

// --- helpers for the scenarios ---

const S = { seconds: 12, seed: 1 };
const killUs = [{ at: 5000, kind: "killRegion" as const, region: "us" }];

test("one region: Europeans pay the ocean on every request", () => {
  const s = summary(run(oneRegion, S), 2);
  assert.equal(s.errorRate, 0);
  // Americans (60%) are answered in ~30 ms; Europeans add 2 x 40 ms.
  assert.ok(s.p50 > 25 && s.p50 < 35, `p50 ${s.p50}`);
  assert.ok(s.p99 > 105 && s.p99 < 125, `p99 ${s.p99}`);
  assert.ok(Math.abs(s.costPerHour - 1.39) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: one region — the region fails, and so does everything", () => {
  const r = run(oneRegion, { ...S, faults: killUs });
  assert.equal(summary(r, 1, 5).errorRate, 0);
  assert.equal(summary(r, 5.2).errorRate, 1);
});

test("broken: active-passive — reads fail until the health check, writes fail until promotion", () => {
  const r = run(activePassive, { ...S, faults: killUs });
  const before = summary(r, 1, 5);
  assert.equal(before.errorRate, 0);
  // Everyone goes to the US: Europe's four servers do nothing, and Europeans still cross the ocean.
  assert.deepEqual(before.replicaUtil.app.slice(4), [0, 0, 0, 0]);
  assert.ok(before.p99 > 105, `p99 ${before.p99}`);
  assert.ok(Math.abs(before.costPerHour - 2.07) < 0.02, `cost ${before.costPerHour}`);
  // The US dies at 5 s; the next check, at 6 s, sees it. Until then nothing works.
  assert.equal(summary(r, 5.1, 6).errorRate, 1);
  const after = summary(r, 6.5);
  assert.equal(after.byKind.read!.errorRate, 0, "reads work from Europe's copy");
  assert.equal(after.byKind.write!.errorRate, 1, "no primary: every write fails");
  // Now the Americans cross the ocean.
  assert.ok(after.byKind.read!.p50 > 100 && after.byKind.read!.p50 < 115, `read p50 ${after.byKind.read!.p50}`);
});

test("promoted: Europe takes writes again", () => {
  const s = summary(run(promoted, S), 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.byKind.write!.p50 > 100 && s.byKind.write!.p50 < 115, `write p50 ${s.byKind.write!.p50}`);
});

test("active-active: every read is local; European writes still cross the ocean", () => {
  const s = summary(run(activeActiveReads, S), 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.byKind.read!.p99 < 40, `read p99 ${s.byKind.read!.p99}`);
  assert.ok(s.byKind.write!.p99 > 105, `write p99 ${s.byKind.write!.p99}`);
  assert.ok(Math.abs(s.costPerHour - 2.07) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: active-active — a European reloads and their own write is missing", () => {
  const s = summary(run(activeActiveReads, S), 2);
  // Europeans are 40% of users; their reload, 200 ms after saving, reads a copy 300 ms behind.
  assert.ok(s.staleOwnRate > 0.33 && s.staleOwnRate < 0.47, `own writes missing ${s.staleOwnRate}`);
});

test("read your writes: right after saving, a user's reads go to the primary", () => {
  const s = summary(run(readYourWrites, S), 2);
  assert.equal(s.staleOwnRate, 0);
  assert.ok(s.byKind.read!.p50 < 30, `read p50 ${s.byKind.read!.p50}`);
  // Those few reads cross the ocean.
  assert.ok(s.byKind.read!.p99 > 100, `read p99 ${s.byKind.read!.p99}`);
});

test("broken: active-active — the US dies: Europe never notices, writes stop", () => {
  const r = run(activeActiveReads, { ...S, faults: killUs });
  const gap = summary(r, 5.1, 6);
  // Until the check at 6 s, American requests fail; Europeans' reads go on.
  assert.ok(gap.byKind.read!.errorRate > 0.5 && gap.byKind.read!.errorRate < 0.7, `read errors ${gap.byKind.read!.errorRate}`);
  const after = summary(r, 6.5);
  assert.equal(after.byKind.read!.errorRate, 0);
  assert.equal(after.byKind.write!.errorRate, 1);
});
