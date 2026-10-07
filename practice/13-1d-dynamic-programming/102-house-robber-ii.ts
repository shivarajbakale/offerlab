/**
 * 213. House Robber II
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/house-robber-ii/
 *
 * Same as House Robber, but the houses are arranged in a circle: the first
 * and last houses are neighbours. Return the maximum amount you can rob
 * without robbing two adjacent houses.
 *
 * Example 1:
 *   Input: nums = [2, 3, 2]
 *   Output: 3
 *
 * Example 2:
 *   Input: nums = [1, 2, 3, 1]
 *   Output: 4
 *
 * Example 3:
 *   Input: nums = [1, 2, 3]
 *   Output: 3
 *
 * Constraints:
 *   1 <= nums.length <= 100
 *   0 <= nums[i] <= 1000
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function rob(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("213. House Robber II", () => {
  assert.equal(rob([2, 3, 2]), 3);
  assert.equal(rob([1, 2, 3, 1]), 4);
  assert.equal(rob([1, 2, 3]), 3);
  assert.equal(rob([7]), 7);
  assert.equal(rob([1, 5]), 5);
});
