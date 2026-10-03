/**
 * 01. Photo Storage per Day
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Photo storage per day",
  prompt:
    "A photo-sharing app has **500 million daily active users**. How much new storage does it need **each day**, counting every copy it keeps? Ignore metadata and video.",
  assumptions: [
    { name: "users", value: 500e6, unit: "people", note: "Daily active users" },
    { name: "photosPerUser", value: 0.2, unit: "photos", note: "Photos uploaded per user per day (1 in 5 users posts one)" },
    { name: "photoBytes", value: 2e6, unit: "bytes", note: "Average original after the app compresses it" },
    { name: "renditions", value: 1.5, unit: "x", note: "Resized copies (thumbnail, feed, full screen) add half the original's size" },
    { name: "copies", value: 3, unit: "x", note: "Full replicas kept, in three availability zones" },
  ],
  steps: [
    { label: "Photos a day", value: 100e6, unit: "photos", how: "500M users × 0.2 photos each." },
    { label: "Originals", value: 200e12, unit: "bytes", how: "100M photos × 2 MB = 200 TB." },
    { label: "With resized copies", value: 300e12, unit: "bytes", how: "200 TB × 1.5. Thumbnails are tiny; the feed-sized copy is most of the extra." },
    { label: "Stored, with replicas", value: 900e12, unit: "bytes", how: "300 TB × 3 copies = 900 TB, about **1 PB a day**." },
  ],
  answer: { value: 900e12, unit: "bytes" },
  tolerance: 3,
  takeaways: [
    "About 1 PB a day is about **330 PB a year**, and it never shrinks: photos are kept forever. Plan storage by the year, not the day.",
    "The replication factor is the biggest lever you control. **Erasure coding** (for example 10 data + 4 parity pieces, 1.4x) keeps photos as safe as 3 copies for half the bytes, and object stores use it for cold data.",
    "Metadata is noise at this scale: 100M rows × 1 KB = 100 GB a day, a thousandth of the photo bytes. Store it in a database; store the bytes in an object store.",
    "Average ingest is 900 TB / 86,400 s ≈ **10 GB/s** inside the data centres; uploads from users are about a fifth of that (originals only, 200 TB a day ≈ 2.3 GB/s); the resized copies are made server-side. Peak is 2-3x the average.",
    "Most photos are rarely viewed after the first week, so move old ones to cheaper, slower storage tiers.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const photos = a.users * a.photosPerUser;
  const originals = photos * a.photoBytes;
  const withRenditions = originals * a.renditions;
  assert.deepEqual(
    checkSteps(drill, {
      "Photos a day": photos,
      Originals: originals,
      "With resized copies": withRenditions,
      "Stored, with replicas": withRenditions * a.copies,
    }),
    [],
  );
});

test("the takeaways' numbers follow from the answer", () => {
  const perYear = drill.answer.value * 365;
  assert.ok(perYear > 320e15 && perYear < 335e15, `${perYear / 1e15} PB a year`);
  const ingest = drill.answer.value / 86_400;
  assert.ok(ingest > 9e9 && ingest < 11e9, `${ingest / 1e9} GB/s`);
  const uploads = drill.steps.find((s) => s.label === "Originals")!.value / 86_400;
  assert.ok(uploads > 2.2e9 && uploads < 2.4e9, `${uploads / 1e9} GB/s of uploads`);
  assert.ok(uploads / ingest > 0.2 && uploads / ingest < 0.25, "about a fifth of the ingest");
  assert.equal(given(drill).users * given(drill).photosPerUser * 1e3, 100e9, "100 GB of metadata a day");
});
