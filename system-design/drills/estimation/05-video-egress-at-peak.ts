/**
 * 05. Video Egress at Peak
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Video streaming egress at the evening peak",
  prompt:
    "A video streaming service has **100 million daily active users**. How much outbound bandwidth, in **gigabits a second**, does it serve at the evening peak?",
  assumptions: [
    { name: "users", value: 100e6, unit: "people", note: "Daily active users" },
    { name: "watchingAtPeak", value: 0.1, unit: "share", note: "Share of them streaming at the same moment at the peak (an assumption)" },
    { name: "bitrate", value: 5e6, unit: "bits/s", note: "Average stream: about 1080p. Phones get less, 4K TVs 15+ Mbps" },
    { name: "cdnPerGB", value: 0.02, unit: "$/GB", note: "For the cost takeaway only: an assumed negotiated CDN rate (at 50 Tbps real contracts are lower still)" },
  ],
  steps: [
    { label: "Concurrent streams", value: 10e6, unit: "streams", how: "100M users × 10% = 10 million at once." },
    { label: "Egress", value: 10e6 * 5e6, unit: "bits/s", how: "10M streams × 5 Mbps = 50 trillion bits a second." },
    { label: "In gigabits", value: (10e6 * 5e6) / 1e9, unit: "Gbps", how: "5e13 / 1e9 = **50,000 Gbps**, or 50 Tbps." },
  ],
  answer: { value: (10e6 * 5e6) / 1e9, unit: "Gbps" },
  tolerance: 3,
  takeaways: [
    "Bandwidth is **concurrent viewers × bitrate**. Daily users only matter through the share watching at once, so pin that number down first.",
    "Mind bits and bytes: 50 Tbps is 6.25 terabytes a second. Network links are sold in bits, storage in bytes.",
    "No single data centre serves 50 Tbps to the internet. Even at 100 Gbps per server that is 500 servers' worth of network cards, and the bytes still have to cross the internet. Large streamers cache video inside or next to ISPs' networks.",
    "Priced at the assumed CDN rate of $0.02/GB, 6.25 TB a second is about **$450,000 an hour** at the peak. At this scale building your own delivery network pays for itself.",
    "The bitrate ladder is the biggest lever: better codecs and adaptive bitrate cut bytes without cutting viewers.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const streams = a.users * a.watchingAtPeak;
  const bits = streams * a.bitrate;
  assert.deepEqual(checkSteps(drill, { "Concurrent streams": streams, Egress: bits, "In gigabits": bits / 1e9 }), []);
});

test("the takeaways' numbers hold", () => {
  const bytesPerSecond = (drill.answer.value * 1e9) / 8;
  assert.equal(bytesPerSecond, 6.25e12, "6.25 TB a second");
  assert.equal(drill.answer.value / 100, 500, "500 servers at 100 Gbps");
  const perHour = (bytesPerSecond / 1e9) * 3600 * given(drill).cdnPerGB;
  assert.equal(Math.round(perHour), 450_000, `$${perHour} an hour`);
});
