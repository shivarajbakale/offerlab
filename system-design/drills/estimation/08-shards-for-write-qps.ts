/**
 * 08. Shards for Write QPS
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Database shards for a write load",
  prompt:
    "An orders service must absorb **200,000 writes a second** at the peak. One relational primary on good hardware has been load-tested at **5,000 of these writes a second**. How many shards do you need?",
  assumptions: [
    { name: "peakWrites", value: 200_000, unit: "writes/s", note: "Peak writes (each an insert with its index updates)" },
    { name: "perShard", value: 5_000, unit: "writes/s", note: "Sustained by one primary in a load test, with replication on. An assumption: real numbers range from hundreds to tens of thousands depending on row size, indexes and durability settings" },
    { name: "targetUtil", value: 0.5, unit: "share", note: "Plan each shard at half its tested limit: room for growth, a hot shard, and replicas catching up" },
    { name: "rowBytes", value: 1_000, unit: "bytes", note: "One order row with its indexes" },
  ],
  steps: [
    { label: "Shards at the limit", value: 40, unit: "shards", how: "200,000 / 5,000 = 40 shards, each running flat out." },
    { label: "Writes per shard planned", value: 2_500, unit: "writes/s", how: "5,000 × 50% = 2,500." },
    { label: "Shards with headroom", value: 80, unit: "shards", how: "200,000 / 2,500 = **80 shards**." },
  ],
  answer: { value: 80, unit: "shards" },
  tolerance: 2,
  takeaways: [
    "**Shards = peak writes / safe writes per shard.** Reads can be spread over replicas; writes cannot, so writes decide the shard count.",
    "The per-shard number must come from a load test of your schema. A write that touches five indexes costs several times one that touches one.",
    "Check storage too: 200,000 writes a second of 1 KB rows is about **17 TB a day** at the peak rate. Storage, not write rate, often forces more shards.",
    "Create many more logical shards than machines (say 1,024 mapped onto 80 hosts). Growth then moves whole logical shards to new hosts, instead of re-hashing every key.",
    "Pick the shard key so most writes and reads touch one shard (customer id for orders). Queries across shards are slow and transactions across them are hard.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const planned = a.perShard * a.targetUtil;
  assert.deepEqual(
    checkSteps(drill, {
      "Shards at the limit": a.peakWrites / a.perShard,
      "Writes per shard planned": planned,
      "Shards with headroom": a.peakWrites / planned,
    }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const a = given(drill);
  const perDay = a.peakWrites * a.rowBytes * 86_400;
  assert.ok(perDay > 17e12 && perDay < 17.5e12, `${perDay / 1e12} TB a day`);
});
