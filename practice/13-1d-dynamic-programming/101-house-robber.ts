/**
 * 198. House Robber
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/house-robber/
 *
 * Houses along a street each hold some money, given by `nums`. Robbing two
 * adjacent houses triggers the alarm. Return the maximum amount you can rob
 * without robbing any two neighbouring houses.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3, 1]
 *   Output: 4   (rob houses 0 and 2: 1 + 3)
 *
 * Example 2:
 *   Input: nums = [2, 7, 9, 3, 1]
 *   Output: 12  (rob houses 0, 2, 4: 2 + 9 + 1)
 *
 * Constraints:
 *   1 <= nums.length <= 100
 *   0 <= nums[i] <= 400
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function rob(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("198. House Robber", () => {
  assert.equal(rob([1, 2, 3, 1]), 4);
  assert.equal(rob([2, 7, 9, 3, 1]), 12);
  assert.equal(rob([5]), 5);
  assert.equal(rob([2, 1, 1, 2]), 4);
});
