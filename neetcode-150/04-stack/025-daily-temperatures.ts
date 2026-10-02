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
 *
 * Approach: Monotonic decreasing stack of indices
 *   Keep indices of days still waiting for a warmer day, with temperatures
 *   decreasing from bottom to top. When today is warmer than the top, pop it
 *   and record the gap. Then push today.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: monotonic-stack
 * Key insight: Days still waiting for a warmer day form a decreasing sequence, so a new
 *   warmer day answers all the cooler ones at the top at once, and each day is pushed and
 *   popped only once.
 * Real world: A stock tool showing, for each day, how long until the price next exceeded
 *   it, computed in one pass over history.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function dailyTemperatures(temperatures: number[]): number[] {
  const answer = new Array<number>(temperatures.length).fill(0);
  const stack: number[] = [];
  for (let i = 0; i < temperatures.length; i++) {
    while (stack.length && temperatures[stack[stack.length - 1]] < temperatures[i]) { // @say Is {temperatures[i]} warmer than the day waiting on top of the stack?
      const j = stack.pop()!;
      answer[j] = i - j; // @say Day {j} waited {i - j} day(s) for a warmer temperature
    }
    stack.push(i); // @say Day {i} ({temperatures[i]}) now waits for a warmer day
  }
  return answer;
}

test("739. Daily Temperatures", () => {
  assert.deepEqual(dailyTemperatures([73, 74, 75, 71, 69, 72, 76, 73]), [1, 1, 4, 2, 1, 1, 0, 0]);
  assert.deepEqual(dailyTemperatures([30, 40, 50, 60]), [1, 1, 1, 0]);
  assert.deepEqual(dailyTemperatures([30, 60, 90]), [1, 1, 0]);
  assert.deepEqual(dailyTemperatures([50, 50, 50]), [0, 0, 0]);
});
