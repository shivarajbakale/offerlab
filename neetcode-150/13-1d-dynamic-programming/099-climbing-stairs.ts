/**
 * 70. Climbing Stairs
 * Difficulty: Easy
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/climbing-stairs/
 *
 * You are climbing a staircase that takes `n` steps to reach the top. Each
 * move you may climb either 1 or 2 steps. Return the number of distinct ways
 * to reach the top.
 *
 * Example 1:
 *   Input: n = 2
 *   Output: 2   (1+1, 2)
 *
 * Example 2:
 *   Input: n = 3
 *   Output: 3   (1+1+1, 1+2, 2+1)
 *
 * Constraints:
 *   1 <= n <= 45
 *
 * Approach: Bottom-up DP (Fibonacci), O(1) space
 *   State: dp[i] = number of ways to reach the top starting from step i.
 *   Recurrence: dp[i] = dp[i + 1] + dp[i + 2], with dp[n] = dp[n - 1] = 1.
 *   Only the last two values are needed, so keep two variables.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: dp-1d
 * Key insight: The last move onto any step is either 1 or 2 stairs, so ways(n) = ways(n -
 *   1) + ways(n - 2), the Fibonacci recurrence. Since only the last two values are
 *   needed, two variables replace the whole table.
 * Real world: Counting how many ways a fixed total can be built from 1- and 2-unit
 *   pieces, as in tiling, packet framing or music rhythm generators.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule one is the number of ways to reach the top from this stair; two, from the stair above
// @why Returns how many ways there are to reach step `n` using moves of 1 or 2 steps.
export function climbStairs(n: number): number {
  // @why `one` means ways from the next step up; stepping 1 from the top leaves 1 way (just finish).
  let one = 1; // ways from step i + 1
  // @why `two` means ways from two steps up; it also starts at 1 so the top counts as one way.
  let two = 1; // ways from step i + 2
  // @why Each round moves one stair down; `n - 1` rounds because the base cases already cover two stairs.
  for (let i = 0; i < n - 1; i++) {
    // @why From a stair you take 1 or 2 steps, so ways = ways from `one` plus ways from `two`.
    const next = one + two; // @ask next // @say Ways = take 1 step ({one}) + take 2 steps ({two})
    two = one; // @say Slide the window down one stair
    one = next; // @say Only the last two answers are ever needed
  }
  // @why After the loop `one` holds the ways from step 0, which is the answer.
  return one;
}

test("70. Climbing Stairs", () => {
  assert.equal(climbStairs(2), 2);
  assert.equal(climbStairs(3), 3);
  assert.equal(climbStairs(1), 1);
  assert.equal(climbStairs(45), 1836311903);
});
