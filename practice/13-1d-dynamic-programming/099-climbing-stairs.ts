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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function climbStairs(n: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("70. Climbing Stairs", () => {
  assert.equal(climbStairs(2), 2);
  assert.equal(climbStairs(3), 3);
  assert.equal(climbStairs(1), 1);
  assert.equal(climbStairs(45), 1836311903);
});
