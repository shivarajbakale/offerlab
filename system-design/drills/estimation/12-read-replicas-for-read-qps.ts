/**
 * 12. Read Replicas for Read QPS
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Read replicas for a read load",
  prompt:
    "A profile service takes **120,000 reads a second** at the peak, with a cache in front of the database. How many read replicas does the database need?",
  assumptions: [
    { name: "peakReads", value: 120_000, unit: "reads/s", note: "Peak reads arriving at the service" },
    { name: "hitRate", value: 0.9, unit: "share", note: "Share answered by the cache" },
    { name: "perReplica", value: 3_000, unit: "reads/s", note: "One replica's limit for these queries in a load test (an assumption)" },
    { name: "targetUtil", value: 0.7, unit: "share", note: "Run replicas at 70% at peak" },
    { name: "spares", value: 1, unit: "replicas", note: "One extra so a replica can fail or be patched at the peak" },
  ],
  steps: [
    { label: "Reads reaching the database", value: 12_000, unit: "reads/s", how: "120,000 × 10% misses = 12,000 a second." },
    { label: "Planned reads per replica", value: 2_100, unit: "reads/s", how: "3,000 × 70% = 2,100." },
    { label: "Replicas for the load", value: 6, unit: "replicas", how: "12,000 / 2,100 = 5.7, round up to 6." },
    { label: "Replicas with a spare", value: 7, unit: "replicas", how: "6 + 1 = **7 replicas**, plus the primary for writes." },
  ],
  answer: { value: 7, unit: "replicas" },
  tolerance: 2,
  takeaways: [
    "**Replicas = (reads × miss rate) / safe reads per replica, plus spares.** Work out what reaches the database before sizing it.",
    "The cache hit rate is the biggest lever: 90% to 95% halves database reads, from 12,000 to 6,000, and removes 3 replicas.",
    "Replicas add read capacity, not write capacity: every replica applies every write. When writes saturate, you shard.",
    "Replicas lag the primary. A user who just saved their profile and reads a replica can see the old one, so route read-your-own-writes to the primary or wait for the replica to catch up.",
    "Watch the cold-cache case: if the cache restarts empty, all 120,000 reads hit the database, 6x what 7 replicas can take. Warm caches or limit traffic during a restart.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const db = a.peakReads * (1 - a.hitRate);
  const planned = a.perReplica * a.targetUtil;
  const forLoad = Math.ceil(db / planned);
  assert.deepEqual(
    checkSteps(drill, {
      "Reads reaching the database": db,
      "Planned reads per replica": planned,
      "Replicas for the load": forLoad,
      "Replicas with a spare": forLoad + a.spares,
    }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const a = given(drill);
  const at95 = a.peakReads * 0.05;
  assert.ok(Math.abs(at95 - 6_000) < 1e-6);
  assert.equal(Math.ceil(at95 / (a.perReplica * a.targetUtil)), 3, "3 replicas at 95%, 3 fewer");
  const cold = a.peakReads / (drill.answer.value * a.perReplica);
  assert.ok(cold > 5.5 && cold < 6, `${cold}x what the replicas take`);
});
