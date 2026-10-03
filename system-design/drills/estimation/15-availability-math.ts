/**
 * 15. Availability Math
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

const MIN = 525_600;
const lb = 1 - 1e-4;
const app = 1 - 1e-3;
const db = 1 - 1e-3;
const dbPair = 1 - 1e-3 * 1e-3;

export const drill = estimation({
  title: "Availability in series and in parallel",
  prompt:
    "Every request passes through a load balancer (**99.99%**), an app tier (**99.9%**) and one database (**99.9%**), and fails if any of them is down. How many **minutes a year** is the service down? Then you add a second database with automatic failover. How many minutes now?",
  assumptions: [
    { name: "lbNines", value: 4, unit: "nines", note: "Load balancer: 99.99%" },
    { name: "appNines", value: 3, unit: "nines", note: "App tier: 99.9%" },
    { name: "dbNines", value: 3, unit: "nines", note: "Each database: 99.9%" },
    { name: "minutesPerYear", value: MIN, unit: "min", note: "365 × 24 × 60" },
  ],
  steps: [
    { label: "Serial availability", value: lb * app * db * 100, unit: "%", how: "In series, multiply: 0.9999 × 0.999 × 0.999 ≈ 99.79%." },
    { label: "Serial downtime", value: (1 - lb * app * db) * MIN, unit: "min/year", how: "0.21% of 525,600 minutes ≈ 1,100 minutes, about 18 hours." },
    { label: "Database pair downtime", value: (1 - dbPair) * MIN, unit: "min/year", how: "In parallel, both must be down: 0.001 × 0.001 = one in a million, about half a minute a year." },
    { label: "Improved availability", value: lb * app * dbPair * 100, unit: "%", how: "0.9999 × 0.999 × 0.999999 ≈ 99.89%." },
    { label: "Improved downtime", value: (1 - lb * app * dbPair) * MIN, unit: "min/year", how: "0.11% of 525,600 ≈ **580 minutes**, about 9.6 hours: now the app tier is the weak link." },
  ],
  answer: { value: (1 - lb * app * dbPair) * MIN, unit: "min/year" },
  tolerance: 2,
  takeaways: [
    "**Series: multiply availabilities. Parallel: multiply unavailabilities.** A chain is weaker than its weakest link; a redundant pair is far stronger than either part.",
    "For small numbers, series downtime is close to the sum: 0.01% + 0.1% + 0.1% = 0.21%. Add downtimes, then find the biggest.",
    "Know the table: **99.9% ≈ 8.8 hours a year, 99.99% ≈ 53 minutes, 99.999% ≈ 5 minutes.**",
    "The parallel math assumes independent failures and instant failover. Both copies in one zone, one bad deploy, or a 60-second failover each break it; failover time counts as downtime.",
    "Fix the weakest link first: doubling the database saved about 9 hours, and the app tier at 99.9% now sets the ceiling.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const avail = (nines: number) => 1 - 10 ** -nines;
  const serial = avail(a.lbNines) * avail(a.appNines) * avail(a.dbNines);
  const pair = 1 - (1 - avail(a.dbNines)) ** 2;
  const improved = avail(a.lbNines) * avail(a.appNines) * pair;
  assert.deepEqual(
    checkSteps(drill, {
      "Serial availability": serial * 100,
      "Serial downtime": (1 - serial) * a.minutesPerYear,
      "Database pair downtime": (1 - pair) * a.minutesPerYear,
      "Improved availability": improved * 100,
      "Improved downtime": (1 - improved) * a.minutesPerYear,
    }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const serial = drill.steps.find((s) => s.label === "Serial downtime")!.value;
  assert.ok(serial > 1_090 && serial < 1_110, `${serial} min`);
  // The sum of downtimes is close to the product.
  assert.ok(Math.abs(serial - 0.0021 * MIN) < 5);
  assert.ok(drill.answer.value > 570 && drill.answer.value < 590);
  assert.ok(Math.abs((serial - drill.answer.value) / 60 - 8.7) < 0.3, "saved about 9 hours");
  assert.ok(Math.abs((1e-3 * MIN) / 60 - 8.76) < 0.01, "99.9% is 8.8 hours");
  assert.ok(Math.abs(1e-4 * MIN - 52.56) < 0.01, "99.99% is 53 minutes");
  assert.ok(Math.abs(1e-5 * MIN - 5.256) < 0.001, "99.999% is 5 minutes");
});
