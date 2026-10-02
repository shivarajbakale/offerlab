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
 *
 * Approach: Bottom-up DP, right to left
 *   State: dp[i] = length of the longest increasing subsequence that starts
 *   at index i.
 *   Recurrence: dp[i] = 1 + max(dp[j]) for j > i with nums[j] > nums[i]
 *   (or 1 if no such j). Answer is max(dp).
 *   (A patience-sorting + binary search variant runs in O(n log n).)
 *
 * Time: O(n^2)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function lengthOfLIS(nums: number[]): number {
  const n = nums.length;
  const dp = new Array<number>(n).fill(1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) {
      if (nums[i] < nums[j]) dp[i] = Math.max(dp[i], 1 + dp[j]);
    }
  }
  return Math.max(...dp);
}

test("300. Longest Increasing Subsequence", () => {
  assert.equal(lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18]), 4);
  assert.equal(lengthOfLIS([0, 1, 0, 3, 2, 3]), 4);
  assert.equal(lengthOfLIS([7, 7, 7, 7, 7, 7, 7]), 1);
  assert.equal(lengthOfLIS([5]), 1);
  assert.equal(lengthOfLIS([1, 2, 3, 4, 5]), 5);
});
