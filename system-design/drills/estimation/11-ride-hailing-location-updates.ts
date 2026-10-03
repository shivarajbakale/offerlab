/**
 * 11. Ride-Hailing Location Updates
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Ride-hailing driver location updates a second",
  prompt:
    "A ride-hailing service has **5 million active drivers**. Every online driver app sends its GPS position every few seconds. How many location updates a second reach the backend **at the global peak**?",
  assumptions: [
    { name: "drivers", value: 5e6, unit: "drivers", note: "Drivers who drove in the last month (an assumption)" },
    { name: "onlineAtPeak", value: 0.2, unit: "share", note: "Share online at the busiest moment" },
    { name: "intervalSeconds", value: 4, unit: "s", note: "Seconds between updates from one app" },
    { name: "updateBytes", value: 100, unit: "bytes", note: "Driver id, lat/lng, heading, speed, timestamp, plus framing" },
  ],
  steps: [
    { label: "Drivers online", value: 1e6, unit: "drivers", how: "5M × 20% = 1 million." },
    { label: "Updates a second", value: 1e6 / 4, unit: "updates/s", how: "1M drivers / 4 s = **250,000 a second**." },
  ],
  answer: { value: 1e6 / 4, unit: "updates/s" },
  tolerance: 3,
  takeaways: [
    "**Rate = active senders / interval.** Halving the interval doubles the load, so the interval is a product decision with a cost.",
    "The bytes are small: 250,000 × 100 bytes = **25 MB a second**. The hard part is 250,000 index updates a second, not bandwidth.",
    "Keep only the latest position in memory, in a geospatial index keyed by map cell (geohash, S2 or H3), so finding nearby drivers is a lookup in a few cells. Do not write every ping to a relational database.",
    "Send the raw stream to a log such as Kafka for trip history and analytics; consumers write it to cheap storage in batches.",
    "Riders also watch cars move: those on a trip watch their driver, and riders opening the app see the cars around them. Size that fan-out separately: the second part can exceed the inbound rate.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const online = a.drivers * a.onlineAtPeak;
  assert.deepEqual(checkSteps(drill, { "Drivers online": online, "Updates a second": online / a.intervalSeconds }), []);
});

test("the takeaways' numbers hold", () => {
  assert.equal(drill.answer.value * given(drill).updateBytes, 25e6, "25 MB a second");
});
