/**
 * 42. Trapping Rain Water
 * Difficulty: Hard
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/trapping-rain-water/
 *
 * Given n non-negative integers describing an elevation map where each bar
 * has width 1, compute how much water is trapped after raining.
 *
 * Example 1:
 *   Input: height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]
 *   Output: 6
 *
 * Example 2:
 *   Input: height = [4, 2, 0, 3, 2, 5]
 *   Output: 9
 *
 * Constraints:
 *   1 <= n <= 2 * 10^4
 *   0 <= height[i] <= 10^5
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function trap(height: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("42. Trapping Rain Water", () => {
  assert.equal(trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]), 6);
  assert.equal(trap([4, 2, 0, 3, 2, 5]), 9);
  assert.equal(trap([5]), 0);
  assert.equal(trap([1, 2, 3, 4]), 0);
});
