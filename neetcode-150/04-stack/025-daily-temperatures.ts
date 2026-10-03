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

// @why For each day, find how many days until a warmer one (0 if never).
export function dailyTemperatures(temperatures: number[]): number[] {
  // @why Default 0 covers days that never see a warmer temperature.
  const answer = new Array<number>(temperatures.length).fill(0);
  // @why Holds indexes of days still waiting for a warmer day; their temperatures never rise toward the top.
  const stack: number[] = [];
  // @why Visit each day once as the possible warmer day.
  for (let i = 0; i < temperatures.length; i++) {
    // @why If today beats the waiting day on top, that waiting day is answered.
    while (stack.length && temperatures[stack[stack.length - 1]] < temperatures[i]) { // @say Is {temperatures[i]} warmer than the day waiting on top of the stack?
      // @why Take the day that just got its answer off the stack.
      const j = stack.pop()!;
      // @why The gap between today and that day is how long it waited.
      answer[j] = i - j; // @say Day {j} waited {i - j} day(s) for a warmer temperature
    }
    // @why Today now waits for its own warmer day.
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
