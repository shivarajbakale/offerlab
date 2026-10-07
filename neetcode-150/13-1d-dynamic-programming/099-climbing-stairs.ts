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
// @goal in how many different orders of 1-steps and 2-steps can you climb {n} {n === 1 ? "stair" : "stairs"}?
export function climbStairs(n: number): number {
  // @why `one` means ways from the next step up; stepping 1 from the top leaves 1 way (just finish).
  // @phase Setup: the two counts nearest the top
  // @say Listing every sequence of 1s and 2s grows like 2^n. But from any stair your first move is 1 step or 2, so its count is just the counts of the next two stairs added. Work down from the top keeping only those two numbers. From stair {n - 1}, one below the top, there is exactly 1 way: a single step.
  let one = 1; // ways from step i + 1
  // @why `two` means ways from two steps up; it also starts at 1 so the top counts as one way.
  // @say Standing on the top (stair {n}) counts as 1 way: you are already done. That makes a 2-step jump that lands exactly on the top count once.
  let two = 1; // ways from step i + 2
  // @why Each round moves one stair down; `n - 1` rounds because the base cases already cover two stairs.
  // @phase Work down one stair at a time
  // @yes Stair {n - 2 - i} still needs its count, and the two stairs above it are known.
  // @no {n === 1 ? "With a single stair, the start is already the stair below the top, so its 1 way is the answer." : "Every stair down to 0, the start, has its count."}
  for (let i = 0; i < n - 1; i++) {
    // @why From a stair you take 1 or 2 steps, so ways = ways from `one` plus ways from `two`.
    // @say From stair {n - 2 - i}: step 1 and finish in {one} {one === 1 ? "way" : "ways"}, or step 2 and finish in {two}. The first move differs, so no climb is counted twice: {one} + {two} = {one + two}.
    const next = one + two; // @ask next
    // @say Slide the window down one stair: stair {n - 1 - i}'s count, {one}, is now the "two up" count.
    two = one;
    // @say Only the last two answers are ever needed, so stair {n - 2 - i}'s {next} replaces the "one up" count.
    // @then Stair {n - 2 - i} reaches the top in {one} ways.
    one = next;
  }
  // @why After the loop `one` holds the ways from step 0, which is the answer.
  // @phase Answer
  // @returns {one}: the count from stair 0, built from the top down in O(n) time and O(1) space.
  return one;
}

test("70. Climbing Stairs", () => {
  assert.equal(climbStairs(2), 2);
  assert.equal(climbStairs(3), 3);
  assert.equal(climbStairs(1), 1);
  assert.equal(climbStairs(45), 1836311903);
});
