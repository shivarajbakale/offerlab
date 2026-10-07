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

// @rule the stack holds days still waiting for a warmer day, coldest on top
// @why For each day, find how many days until a warmer one (0 if never).
// @goal for each day of {JSON.stringify(temperatures)}, how many days until a warmer one?
export function dailyTemperatures(temperatures: number[]): number[] {
  // @why Default 0 covers days that never see a warmer temperature.
  // @phase Setup: answers default to 0, and a stack of waiting days
  // @say Scanning forward from every day is n² work. Instead let each day wait on a stack until a warmer day arrives. The waiting days are never warmer toward the top, so a new day only has to check the top.
  const answer = new Array<number>(temperatures.length).fill(0);
  // @why Holds indexes of days still waiting for a warmer day; their temperatures never rise toward the top.
  const stack: number[] = [];
  // @why Visit each day once as the possible warmer day.
  // @phase Each day answers the colder days waiting before it
  // @yes Day {i} ({temperatures[i]}°) arrives. It may be the warmer day some waiting days need.
  // @no Every day has been seen. Days still waiting never got a warmer day, so their answer stays 0.
  for (let i = 0; i < temperatures.length; i++) {
    // @why If today beats the waiting day on top, that waiting day is answered.
    // @yes Day {stack[stack.length - 1]} ({temperatures[stack[stack.length - 1]]}°) on top is colder than today's {temperatures[i]}°. Today is its first warmer day: any warmer day in between would already have popped it.
    // @no {stack.length ? "Day " + stack[stack.length - 1] + " on top (" + temperatures[stack[stack.length - 1]] + "°) is not colder than " + temperatures[i] + "°. The days below it are even warmer, so none of them is answered today either" : "No earlier day is still waiting, so there is nothing more to answer"}.
    while (stack.length && temperatures[stack[stack.length - 1]] < temperatures[i]) { // @broken
      // @why Take the day that just got its answer off the stack.
      // @say Day {stack[stack.length - 1]} has its answer, so it stops waiting.
      const j = stack.pop()!; // @ask j
      // @why The gap between today and that day is how long it waited.
      // @say Day {j} waited {i} − {j} = {i - j} {i - j === 1 ? "day" : "days"} for a warmer temperature.
      answer[j] = i - j; // @moment day {i} answers day {j}
    }
    // @why Today now waits for its own warmer day.
    // @say Day {i} ({temperatures[i]}°) now waits for its own warmer day.
    // @then Waiting, bottom to top: {stack.map((d) => temperatures[d] + "°").join(", ")}, never warmer toward the top.
    stack.push(i); // @ask stack.length
  }
  // @phase Answer
  // @returns {JSON.stringify(answer)}: each day was pushed and popped at most once, so O(n).
  return answer;
}

test("739. Daily Temperatures", () => {
  assert.deepEqual(dailyTemperatures([73, 74, 75, 71, 69, 72, 76, 73]), [1, 1, 4, 2, 1, 1, 0, 0]);
  assert.deepEqual(dailyTemperatures([30, 40, 50, 60]), [1, 1, 1, 0]);
  assert.deepEqual(dailyTemperatures([30, 60, 90]), [1, 1, 0]);
  assert.deepEqual(dailyTemperatures([50, 50, 50]), [0, 0, 0]);
});
