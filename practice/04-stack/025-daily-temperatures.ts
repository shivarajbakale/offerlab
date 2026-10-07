/**
 * 739. Daily Temperatures
 * Difficulty: Medium
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/daily-temperatures/
 *
 * Given an array `temperatures` of daily temperatures, return an array
 * `answer` where answer[i] is the number of days after day i until a warmer
 * temperature. If no warmer day follows, answer[i] = 0.
 *
 * Example 1:
 *   Input: temperatures = [73, 74, 75, 71, 69, 72, 76, 73]
 *   Output: [1, 1, 4, 2, 1, 1, 0, 0]
 *
 * Example 2:
 *   Input: temperatures = [30, 40, 50, 60]
 *   Output: [1, 1, 1, 0]
 *
 * Example 3:
 *   Input: temperatures = [30, 60, 90]
 *   Output: [1, 1, 0]
 *
 * Constraints:
 *   1 <= temperatures.length <= 10^5
 *   30 <= temperatures[i] <= 100
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function dailyTemperatures(temperatures: number[]): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("739. Daily Temperatures", () => {
  assert.deepEqual(dailyTemperatures([73, 74, 75, 71, 69, 72, 76, 73]), [1, 1, 4, 2, 1, 1, 0, 0]);
  assert.deepEqual(dailyTemperatures([30, 40, 50, 60]), [1, 1, 1, 0]);
  assert.deepEqual(dailyTemperatures([30, 60, 90]), [1, 1, 0]);
  assert.deepEqual(dailyTemperatures([50, 50, 50]), [0, 0, 0]);
});
