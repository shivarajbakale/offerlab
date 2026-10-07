/**
 * 152. Maximum Product Subarray
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/maximum-product-subarray/
 *
 * Given an integer array `nums`, find a non-empty contiguous subarray with
 * the largest product and return that product.
 *
 * Example 1:
 *   Input: nums = [2, 3, -2, 4]
 *   Output: 6   ([2, 3])
 *
 * Example 2:
 *   Input: nums = [-2, 0, -1]
 *   Output: 0
 *
 * Constraints:
 *   1 <= nums.length <= 2 * 10^4
 *   -10 <= nums[i] <= 10
 *   The product of any subarray fits in a 32-bit integer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxProduct(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("152. Maximum Product Subarray", () => {
  assert.equal(maxProduct([2, 3, -2, 4]), 6);
  assert.equal(maxProduct([-2, 0, -1]), 0);
  assert.equal(maxProduct([-2]), -2);
  assert.equal(maxProduct([-2, 3, -4]), 24);
});
