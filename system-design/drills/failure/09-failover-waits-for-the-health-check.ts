/**
 * 09. Failover Waits for the Health Check
 * Level: Staff
 * Group: Failure drills
 *
 * Symptom: the us region goes dark at 4.5 s and every request fails for about 5.5 seconds, though
 *   the standby region in eu is healthy and idle the whole time. Cause (hidden from the reader):
 *   the global load balancer checks health every 10 s, so it keeps sending everyone to the dead
 *   region until its next check at 10 s.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { clients, database, design, loadBalancer, server, summary } from "../../traffic/index.ts";

// A read-only catalog, 1,200 requests a second; 60% of users in the us, 40% in eu. Six app servers,
// three per region, and a database copy in each region. Active-passive: the global load balancer
// sends everyone to us while us has a healthy server, else to eu. Regions are 80 ms apart, one way.
const catalog = (name: string, healthCheckMs: number) =>
  design(name, {
    users: clients({ to: "lb", qps: 1200, mix: { read: 1, write: 0 }, regions: { us: 0.6, eu: 0.4 } }),
    lb: loadBalancer({ to: "app", geo: ["us", "eu"], healthCheckMs }),
    app: server({ replicas: 6, cores: 4, serviceMs: { read: 5, write: 6 }, region: ["us", "eu"], calls: ["db"] }),
    db: database({ cores: 4, readMs: 2, writeMs: 4, replicas: 2, region: ["us", "eu"] }),
  });

export const drill = failureDrill({
  title: "A standby region, and a 5-second outage anyway",
  context:
    "A product catalog in **two regions**, us (primary) and eu (standby), each with 3 app servers and a database copy. A global load balancer sends **all** users to us while it is healthy, and fails over to eu when it is not. At 4.5 s the whole us region goes dark. From then **every request fails** until about 10 s; after that everything works again, from eu, with users in the us seeing about 160 ms more latency. The eu servers were healthy and idle the entire time.",
  design: catalog("Active-passive, health checked every 10 s", 10_000),
  faults: [{ at: 4500, kind: "killRegion", region: "us" }],
  seconds: 20,
  seed: 1,
  question: "eu was ready the whole time. Why did failover take about 5.5 seconds?",
  options: [
    {
      text: "The load balancer learns that us is down only at its next health check, every 10 s; until the check at 10 s it keeps sending everyone to the dead servers.",
      correct: true,
      why: "Failover is never instant: it takes as long as **detecting** the failure plus **switching** traffic. Here the switch is immediate but detection waits for the next check, so the outage lasts from the crash to the next check: 4.5 s to 10 s. On average that is half the check interval, at worst all of it. After the switch, us users' requests cross the ocean both ways: about 2 x 80 ms more.",
    },
    {
      text: "The eu region needed time to warm up and take the load.",
      why: "The eu servers run at about half their capacity from the first second after the switch, with no errors. They were never the problem; no traffic reached them until the load balancer switched.",
    },
    {
      text: "The eu database had to be promoted before it could serve.",
      why: "This catalog only reads, and each region has its own copy, so eu reads its local copy at once. A system that writes would have that problem too (a replica must be promoted to accept writes), on top of this one.",
    },
    {
      text: "The users' clients cached the dead servers' addresses.",
      why: "Plausible with DNS-based failover, where resolvers keep an old answer until its TTL runs out. Here every request goes through the load balancer, and the outage ends exactly at its next health check.",
    },
  ],
  fix: {
    design: catalog("Active-passive, health checked every second", 1000),
    explain:
      "**Detect faster.** Checking health every second ends the outage at the first check after the crash: well under a second of errors here. Real health checks also need several failures in a row before acting, so a single slow answer does not trigger a failover; detection time is about interval x threshold, and with DNS-based failover the record's TTL adds to it. The bigger change is **active-active**: serve each user from their nearest region all the time, so a region failure only affects its own users, and the standby is never cold or untested. It costs keeping data in both regions consistent, which this read-only catalog avoids.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const before = summary(broken, 1, 4);
  assert.equal(before.errorRate, 0);
  // eu is idle before: active-passive.
  assert.ok(before.replicaUtil.app.filter((_, i) => i % 2 === 1).every((u) => u === 0), `eu ${before.replicaUtil.app}`);
  // Every request fails from just after the crash until the check at 10 s.
  assert.equal(summary(broken, 5, 10).errorRate, 1);
  // Then eu serves everyone, about half busy, with no errors; us users pay about 160 ms more.
  const after = summary(broken, 11, 20);
  assert.equal(after.errorRate, 0);
  assert.ok(after.replicaUtil.app.filter((_, i) => i % 2 === 1).every((u) => u > 0.4 && u < 0.6), `eu ${after.replicaUtil.app}`);
  assert.ok(after.p50 - before.p50 > 150 && after.p50 - before.p50 < 170, `p50 ${before.p50} -> ${after.p50}`);
});

test("the fix removes it: well under a second of errors", () => {
  const { fixed } = playDrill(drill);
  assert.equal(summary(fixed, 1, 4).errorRate, 0);
  // Errors from 4.5 s stop at the check at 5 s.
  assert.equal(summary(fixed, 5.5, 20).errorRate, 0);
  assert.ok(summary(fixed, 4, 6).errorRate < 0.3, `errors 4-6 s ${summary(fixed, 4, 6).errorRate}`);
});
