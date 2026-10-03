/**
 * 14. Object Store Metadata
 * Level: Staff
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Object count and metadata size for an object store",
  prompt:
    "You are building an S3-style object store. Customers write **1 billion new objects a day** and about a fifth are deleted eventually. After **three years**, how many objects are stored, and how big is the **metadata** index (not the object bytes), with replicas?",
  assumptions: [
    { name: "perDay", value: 1e9, unit: "objects", note: "New objects a day" },
    { name: "days", value: 365 * 3, unit: "days", note: "Three years" },
    { name: "kept", value: 0.8, unit: "share", note: "Share never deleted" },
    { name: "keyBytes", value: 100, unit: "bytes", note: "Bucket name plus object key (paths can be long)" },
    { name: "attrBytes", value: 100, unit: "bytes", note: "Size, checksum, timestamps, version, storage class, owner" },
    { name: "locationBytes", value: 100, unit: "bytes", note: "Where the data lives: which disks hold which pieces" },
    { name: "copies", value: 3, unit: "x", note: "Replicas of the metadata store" },
  ],
  steps: [
    { label: "Objects stored", value: 1e9 * 365 * 3 * 0.8, unit: "objects", how: "1B a day × 1,095 days × 80% ≈ 876 billion." },
    { label: "Metadata per object", value: 300, unit: "bytes", how: "100 key + 100 attributes + 100 location." },
    { label: "One copy", value: 1e9 * 365 * 3 * 0.8 * 300, unit: "bytes", how: "876B × 300 bytes ≈ 263 TB." },
    { label: "With replicas", value: 1e9 * 365 * 3 * 0.8 * 300 * 3, unit: "bytes", how: "263 TB × 3 ≈ **790 TB** of metadata." },
  ],
  answer: { value: 1e9 * 365 * 3 * 0.8 * 300 * 3, unit: "bytes" },
  tolerance: 3,
  takeaways: [
    "Nearly a petabyte of metadata means the index is itself a large sharded database, separate from the machines holding the bytes.",
    "Listing objects by prefix needs keys in sorted order, so the index is split into **key ranges**, not hashed. Ranges that get hot are split further. S3 documents its request limits per key prefix for this reason.",
    "Metadata is small next to data: at a 1 MB average object, 876B objects are 876 PB of data, a thousand times the metadata. But every request reads metadata, so it is the hot path.",
    "Writes average 1B / 86,400 ≈ **12,000 a second**, and reads are many times that: the metadata store needs a cache or must be sized for read QPS too.",
    "The key is the biggest field: long keys from deep paths can double the index. Store bucket and key compactly, and keep the location map small.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const objects = a.perDay * a.days * a.kept;
  const per = a.keyBytes + a.attrBytes + a.locationBytes;
  const one = objects * per;
  assert.deepEqual(
    checkSteps(drill, { "Objects stored": objects, "Metadata per object": per, "One copy": one, "With replicas": one * a.copies }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const a = given(drill);
  const objects = a.perDay * a.days * a.kept;
  assert.ok(Math.abs(objects - 876e9) < 1e9);
  const data = objects * 1e6;
  const ratio = data / drill.answer.value;
  assert.ok(ratio > 1000 && ratio < 1200, `data is ${ratio}x the metadata`);
  assert.ok(Math.abs(a.perDay / 86_400 - 11_574) < 1, "about 12,000 writes a second");
});
