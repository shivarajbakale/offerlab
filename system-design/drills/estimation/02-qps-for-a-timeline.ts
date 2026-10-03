/**
 * 02. QPS for a Timeline
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Peak requests a second for a home timeline",
  prompt:
    "A social network has **200 million daily active users**. Each one opens the app a few times a day and scrolls their home timeline. How many timeline requests a second must the service handle **at the daily peak**?",
  assumptions: [
    { name: "users", value: 200e6, unit: "people", note: "Daily active users" },
    { name: "sessions", value: 5, unit: "a day", note: "Times each user opens the app per day" },
    { name: "pages", value: 4, unit: "pages", note: "Timeline pages per visit: the first load and three scrolls" },
    { name: "secondsPerDay", value: 86_400, unit: "s", note: "Seconds in a day" },
    { name: "peakToMean", value: 3, unit: "x", note: "The evening peak against the daily average" },
  ],
  steps: [
    { label: "Timeline requests a day", value: 4e9, unit: "requests", how: "200M users × 5 visits × 4 pages." },
    { label: "Average", value: 4e9 / 86_400, unit: "requests/s", how: "4B / 86,400 s ≈ 46k a second. (Shortcut: 1M a day ≈ 12 a second.)" },
    { label: "Peak", value: (4e9 / 86_400) * 3, unit: "requests/s", how: "46k × 3 ≈ **140k a second** at the evening peak." },
  ],
  answer: { value: (4e9 / 86_400) * 3, unit: "requests/s" },
  tolerance: 3,
  takeaways: [
    "**1 million a day is about 12 a second** (1e6 / 86,400). Divide daily counts by 100k for a quick average.",
    "Size for the peak, not the average: 2-3x for a consumer app with one big time zone, less for a global one.",
    "One timeline request is not one backend request. Assembling a page of 20 posts with authors, counts and media can mean 20-50 internal calls, so 140k a second at the edge is millions a second inside: this is why timelines are precomputed (fan-out on write) and cached.",
    "Reads dominate: if 1 in 10 users posts once a day, that is 20M posts a day (about 230 a second) against 140k timeline reads a second at the peak.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const perDay = a.users * a.sessions * a.pages;
  const mean = perDay / a.secondsPerDay;
  assert.deepEqual(checkSteps(drill, { "Timeline requests a day": perDay, Average: mean, Peak: mean * a.peakToMean }), []);
});

test("the shortcuts in the working are close", () => {
  const a = given(drill);
  assert.ok(Math.abs(1e6 / a.secondsPerDay - 12) < 0.5, "1M a day is about 12 a second");
  assert.ok(Math.abs(drill.answer.value - 140e3) < 0.01 * 140e3, `peak ${drill.answer.value}`);
  // 20M posts a day is about 230 a second.
  assert.ok(Math.abs(20e6 / a.secondsPerDay - 230) < 5);
});
