/**
 * 13. Leaderboard Memory
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Leaderboard memory for 100 million players",
  prompt:
    "A game keeps one global leaderboard of **100 million players** in a Redis sorted set (member = player id, score = points). How much memory does one copy of the sorted set take?",
  assumptions: [
    { name: "players", value: 100e6, unit: "players" },
    { name: "memberBytes", value: 24, unit: "bytes", note: "The player id string (\"p:12345678\") with its length header, rounded up by the memory allocator" },
    { name: "skiplistBytes", value: 48, unit: "bytes", note: "Skip-list node: score, pointer to the member, back pointer, and on average about 1.3 levels of forward links, each with a span count (which is how ZRANK computes a rank). Approximate" },
    { name: "hashBytes", value: 32, unit: "bytes", note: "Hash-table entry mapping member to score (for O(1) score lookups), plus its share of the bucket array. Approximate" },
  ],
  steps: [
    { label: "Bytes per player", value: 24 + 48 + 32, unit: "bytes", how: "24 member + 48 skip-list node + 32 hash entry ≈ 100 bytes." },
    { label: "One copy", value: 100e6 * (24 + 48 + 32), unit: "bytes", how: "100M × 104 bytes ≈ **10 GB**." },
  ],
  answer: { value: 100e6 * (24 + 48 + 32), unit: "bytes" },
  tolerance: 3,
  takeaways: [
    "A large Redis sorted set costs **roughly 100 bytes per member**, several times the 8-byte score and short id it stores: it keeps both a skip list (for ranks) and a hash table (for lookups). Verify with `MEMORY USAGE` on a sample.",
    "10 GB fits on one machine, so do not shard it. Sharding one leaderboard across nodes turns every rank lookup into a query to every shard (sum each shard's `ZCOUNT` above the score).",
    "Updates and rank lookups are O(log N): with Redis's 1-in-4 promotion a 100M-member skip list is about 13 levels high (log4 100M), and a lookup takes a few dozen pointer steps, so one node handles tens of thousands a second.",
    "Plan RAM for more than one copy: a replica doubles it, and saving a snapshot forks the process, so pages written during the save are copied. Under heavy writes that can approach 2x.",
    "Store only what ranking needs in the set. Names and avatars live elsewhere, fetched for the 50 rows on screen.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const per = a.memberBytes + a.skiplistBytes + a.hashBytes;
  assert.deepEqual(checkSteps(drill, { "Bytes per player": per, "One copy": a.players * per }), []);
});

test("the takeaways' numbers hold", () => {
  const levels = Math.log(given(drill).players) / Math.log(4);
  assert.ok(levels > 13 && levels < 14, `${levels} levels`);
  // Redis skip lists promote a node a level with probability 1/4: expected levels 1/(1 - 1/4).
  assert.ok(Math.abs(1 / (1 - 0.25) - 1.33) < 0.01);
  assert.ok(Math.abs(drill.answer.value - 10e9) < 0.5e9);
});
