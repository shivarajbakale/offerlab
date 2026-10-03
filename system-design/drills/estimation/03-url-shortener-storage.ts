/**
 * 03. URL Shortener Storage
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "URL shortener storage over five years",
  prompt:
    "A URL shortener creates **100 million new short links a day** and never deletes them. How much database storage does it need after **five years**, counting every replica? Ignore click analytics.",
  assumptions: [
    { name: "linksPerDay", value: 100e6, unit: "links", note: "New short links a day (an assumption for a large public shortener)" },
    { name: "days", value: 365 * 5, unit: "days", note: "Five years" },
    { name: "rowBytes", value: 500, unit: "bytes", note: "One row: 7-char code, long URL (~100-200 bytes), owner, created/expiry times, plus index and storage overhead. An assumption; measure a real table" },
    { name: "copies", value: 3, unit: "x", note: "A primary and two replicas" },
  ],
  steps: [
    { label: "Links after five years", value: 100e6 * 365 * 5, unit: "links", how: "100M a day × 1,825 days ≈ 183 billion links." },
    { label: "One copy", value: 100e6 * 365 * 5 * 500, unit: "bytes", how: "183B rows × 500 bytes ≈ 91 TB." },
    { label: "With replicas", value: 100e6 * 365 * 5 * 500 * 3, unit: "bytes", how: "91 TB × 3 copies ≈ **274 TB**." },
  ],
  answer: { value: 100e6 * 365 * 5 * 500 * 3, unit: "bytes" },
  tolerance: 3,
  takeaways: [
    "Count rows first, then bytes per row, then copies. Rows are the number most people get wrong: **daily × 365 × years**.",
    "A 7-character base62 code gives 62^7 ≈ **3.5 trillion** codes. 183 billion links use about 5% of them, so 7 characters is enough for decades at this rate; 6 characters (57 billion) is not.",
    "274 TB will not fit on one database machine: you shard by the short code (a hash of it spreads writes evenly, and every lookup is by code).",
    "Writes are tiny: 100M a day is about **1,200 a second**. Reads are often 10-100x higher, which is why redirects are served from a cache.",
    "Bytes per row is the soft number. Index overhead can match the data itself, so measure a real table before buying disks.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const links = a.linksPerDay * a.days;
  const one = links * a.rowBytes;
  assert.deepEqual(checkSteps(drill, { "Links after five years": links, "One copy": one, "With replicas": one * a.copies }), []);
});

test("the takeaways' numbers hold", () => {
  const a = given(drill);
  const codes7 = 62 ** 7;
  assert.ok(codes7 > 3.5e12 && codes7 < 3.6e12, `62^7 = ${codes7}`);
  const used = (a.linksPerDay * a.days) / codes7;
  assert.ok(used > 0.05 && used < 0.055, `${used} of the code space`);
  assert.ok(62 ** 6 < a.linksPerDay * a.days, "6 characters is not enough");
  assert.ok(Math.abs(a.linksPerDay / 86_400 - 1_160) < 10, "about 1,200 writes a second");
  assert.ok(Math.abs(drill.answer.value - 274e12) < 1e12);
});
