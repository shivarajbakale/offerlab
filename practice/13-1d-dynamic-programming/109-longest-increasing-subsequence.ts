/**
 * 300. Longest Increasing Subsequence
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/longest-increasing-subsequence/
 *
 * Given an integer array `nums`, return the length of the longest strictly
 * increasing subsequence (elements kept in order, not necessarily adjacent).
 *
 * Example 1:
 *   Input: nums = [10, 9, 2, 5, 3, 7, 101, 18]
 *   Output: 4   ([2, 3, 7, 101])
 *
 * Example 2:
 *   Input: nums = [0, 1, 0, 3, 2, 3]
 *   Output: 4
 *
 * Example 3:
 *   Input: nums = [7, 7, 7, 7, 7, 7, 7]
 *   Output: 1
 *
 * Constraints:
 *   1 <= nums.length <= 2500
 *   -10^4 <= nums[i] <= 10^4
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function lengthOfLIS(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("300. Longest Increasing Subsequence", () => {
  assert.equal(lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18]), 4);
  assert.equal(lengthOfLIS([0, 1, 0, 3, 2, 3]), 4);
  assert.equal(lengthOfLIS([7, 7, 7, 7, 7, 7, 7]), 1);
  assert.equal(lengthOfLIS([5]), 1);
  assert.equal(lengthOfLIS([1, 2, 3, 4, 5]), 5);
});
