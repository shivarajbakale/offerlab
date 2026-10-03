/**
 * 10. CDN Cost vs Origin Egress
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "CDN cost per month against serving from origin",
  prompt:
    "A media-heavy site has **20 million daily users**, each downloading about **10 MB** of images and scripts a day. What is the monthly delivery bill with a CDN in front, and how does it compare with serving every byte from the cloud origin?",
  assumptions: [
    { name: "users", value: 20e6, unit: "people", note: "Daily users" },
    { name: "bytesPerUser", value: 10e6, unit: "bytes", note: "Static bytes each downloads a day" },
    { name: "days", value: 30, unit: "days", note: "One month" },
    { name: "originPerGB", value: 0.05, unit: "$/GB", note: "Cloud internet egress, tiered: at petabytes a month the blended rate is about $0.05/GB (the first-tier list price is $0.09)" },
    { name: "cdnPerGB", value: 0.02, unit: "$/GB", note: "CDN delivery at a negotiated volume rate (an assumption; quotes vary widely)" },
    { name: "hitRate", value: 0.95, unit: "share", note: "Bytes the CDN serves from its own cache" },
  ],
  steps: [
    { label: "Bytes a month", value: 20e6 * 10e6 * 30, unit: "bytes", how: "20M × 10 MB × 30 days = 6 PB." },
    { label: "Gigabytes a month", value: 6e6, unit: "GB", how: "6e15 / 1e9 = 6 million GB." },
    { label: "Origin only", value: 6e6 * 0.05, unit: "$/month", how: "6M GB × $0.05 = $300,000 a month." },
    { label: "CDN delivery", value: 6e6 * 0.02, unit: "$/month", how: "Every byte leaves the CDN: 6M GB × $0.02 = $120,000." },
    { label: "Origin for misses", value: 6e6 * 0.05 * 0.05, unit: "$/month", how: "5% misses go back to origin: 300k GB × $0.05 = $15,000." },
    { label: "With a CDN", value: 6e6 * 0.02 + 6e6 * 0.05 * 0.05, unit: "$/month", how: "$120,000 + $15,000 = **$135,000 a month**, about 45% of the origin-only bill." },
  ],
  answer: { value: 6e6 * 0.02 + 6e6 * 0.05 * 0.05, unit: "$/month" },
  tolerance: 2,
  takeaways: [
    "Monthly egress is **users × bytes each × days × price per GB**. Get the bytes right first; prices are a lookup.",
    "The hit rate drives origin cost: at 95% the origin sees 1 byte in 20. Long cache lifetimes with versioned file names push it higher.",
    "The CDN also cuts latency and absorbs spikes, and origin servers shrink: they serve 5% of the bytes.",
    "Compare like with like: price origin egress at the $0.09 first-tier list rate and the CDN looks like a nearly 4x saving ($147,000 against $540,000). Nobody moving 6 PB a month pays that list rate, so the fair saving is closer to 2x.",
    "Some clouds do not charge egress from their storage to their own CDN, which makes the miss line nearly free. Check your provider's pricing.",
    "Bytes are the lever under both bills: modern image formats and right-sized images cut the whole thing proportionally.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const bytes = a.users * a.bytesPerUser * a.days;
  const gb = bytes / 1e9;
  const cdn = gb * a.cdnPerGB;
  const misses = gb * (1 - a.hitRate) * a.originPerGB;
  assert.deepEqual(
    checkSteps(drill, {
      "Bytes a month": bytes,
      "Gigabytes a month": gb,
      "Origin only": gb * a.originPerGB,
      "CDN delivery": cdn,
      "Origin for misses": misses,
      "With a CDN": cdn + misses,
    }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const origin = drill.steps.find((s) => s.label === "Origin only")!.value;
  const share = drill.answer.value / origin;
  assert.ok(share > 0.44 && share < 0.46, `${share} of the origin-only bill`);
  const a = given(drill);
  const gb = (a.users * a.bytesPerUser * a.days) / 1e9;
  const listOrigin = gb * 0.09;
  const listWithCdn = gb * a.cdnPerGB + gb * (1 - a.hitRate) * 0.09;
  assert.equal(Math.round(listOrigin), 540_000, "$540,000 at list price");
  assert.equal(Math.round(listWithCdn), 147_000, "$147,000 at list price");
  assert.ok(listOrigin / listWithCdn > 3.5 && listOrigin / listWithCdn < 4, "nearly 4x at list price");
  assert.ok(1 / share > 2 && 1 / share < 2.3, "closer to 2x at the blended rate");
});
