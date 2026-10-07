/**
 * 53. Maximum Subarray
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/maximum-subarray/
 *
 * Given an integer array `nums`, find the contiguous non-empty subarray with
 * the largest sum and return that sum.
 *
 * Example 1:
 *   Input: nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
 *   Output: 6   (subarray [4, -1, 2, 1])
 *
 * Example 2:
 *   Input: nums = [1]
 *   Output: 1
 *
 * Example 3:
 *   Input: nums = [5, 4, -1, 7, 8]
 *   Output: 23
 *
 * Constraints:
 *   1 <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxSubArray(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("53. Maximum Subarray", () => {
  assert.equal(maxSubArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]), 6);
  assert.equal(maxSubArray([1]), 1);
  assert.equal(maxSubArray([5, 4, -1, 7, 8]), 23);
  assert.equal(maxSubArray([-3, -1, -2]), -1); // all negative
});
