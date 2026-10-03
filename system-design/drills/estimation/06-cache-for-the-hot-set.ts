/**
 * 06. Cache for the Hot Set
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Cache memory for the hot 20%",
  prompt:
    "A product catalogue has **1 billion items**. About 20% of them get most of the reads, so you want them all in an in-memory cache such as Redis or Memcached. How much RAM does the cache cluster need, with one replica of every cached item?",
  assumptions: [
    { name: "items", value: 1e9, unit: "items", note: "Items in the catalogue" },
    { name: "hotShare", value: 0.2, unit: "share", note: "The hot set (the 80/20 rule is an assumption; check it against access logs)" },
    { name: "valueBytes", value: 1000, unit: "bytes", note: "Serialized item: title, price, a few attributes" },
    { name: "keyBytes", value: 50, unit: "bytes", note: "Key with a namespace, such as catalog:v2:item:1234567890 (26 bytes), plus its length header and allocator rounding" },
    { name: "overheadBytes", value: 50, unit: "bytes", note: "Per-entry bookkeeping inside the cache (hash entry, pointers, expiry). Roughly; measure it" },
    { name: "headroom", value: 1.25, unit: "x", note: "Fragmentation and room to grow: keep memory at about 80% full" },
    { name: "copies", value: 2, unit: "x", note: "A primary and one replica" },
  ],
  steps: [
    { label: "Hot items", value: 200e6, unit: "items", how: "1B × 20% = 200 million." },
    { label: "Bytes per entry", value: 1100, unit: "bytes", how: "1,000 value + 50 key + 50 overhead." },
    { label: "Hot set", value: 200e6 * 1100, unit: "bytes", how: "200M × 1.1 KB = 220 GB." },
    { label: "With headroom", value: 200e6 * 1100 * 1.25, unit: "bytes", how: "220 GB × 1.25 = 275 GB." },
    { label: "Cluster RAM, with replicas", value: 200e6 * 1100 * 1.25 * 2, unit: "bytes", how: "275 GB × 2 = **550 GB**." },
  ],
  answer: { value: 200e6 * 1100 * 1.25 * 2, unit: "bytes" },
  tolerance: 3,
  takeaways: [
    "Cache size is **hot items × (value + key + overhead) × headroom × copies**. Small values make the per-entry overhead matter: at 100-byte values it doubles the bill.",
    "550 GB is about **9 nodes with 64 GB** of usable cache each. Spread keys across them with consistent hashing or hash slots.",
    "The 20% is a guess. Plot a hit-rate curve from real access logs (hit rate against cache size) and buy the knee of the curve.",
    "Compress large values, or cache only the fields the hot path reads: halving the value roughly halves the cluster.",
    "A replica doubles RAM but means a node loss does not send its whole share of reads to the database at once.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const hot = a.items * a.hotShare;
  const entry = a.valueBytes + a.keyBytes + a.overheadBytes;
  const set = hot * entry;
  const room = set * a.headroom;
  assert.deepEqual(
    checkSteps(drill, {
      "Hot items": hot,
      "Bytes per entry": entry,
      "Hot set": set,
      "With headroom": room,
      "Cluster RAM, with replicas": room * a.copies,
    }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  assert.equal(Math.ceil(drill.answer.value / 64e9), 9, "9 nodes of 64 GB");
  const a = given(drill);
  // At 100-byte values the entry is 200 bytes, double the 100-byte value.
  assert.equal((100 + a.keyBytes + a.overheadBytes) / 100, 2);
});
