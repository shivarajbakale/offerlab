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
 *
 * Pattern: dp-1d
 * Key insight: The longest increasing subsequence starting at i is 1 plus the best one
 *   starting at any later, larger element. Solving right to left means those later
 *   answers are ready, giving O(n^2).
 * Real world: Diff tools like patience diff, which use the longest increasing subsequence
 *   of matching unique lines to align two file versions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[i] is the length of the longest increasing subsequence starting at index i
// @why Returns the length of the longest strictly increasing subsequence.
export function lengthOfLIS(nums: number[]): number {
  // @why Number of elements.
  const n = nums.length;
  // @why `dp[i]` means the longest increasing subsequence starting at `i`; at least 1 (just itself).
  const dp = new Array<number>(n).fill(1);
  // @why Go from the right so every later `dp[j]` is already final.
  for (let i = n - 1; i >= 0; i--) {
    // @why Look at every element after `i` that could come next in the sequence.
    for (let j = i + 1; j < n; j++) {
      // @why If `nums[j]` is bigger, `i` can be followed by `j`'s sequence: length `1 + dp[j]`; keep the best.
      if (nums[i] < nums[j]) dp[i] = Math.max(dp[i], 1 + dp[j]); // @ask dp[i]
    }
  }
  // @why The sequence can start anywhere, so the answer is the biggest `dp` value.
  return Math.max(...dp);
}

test("300. Longest Increasing Subsequence", () => {
  assert.equal(lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18]), 4);
  assert.equal(lengthOfLIS([0, 1, 0, 3, 2, 3]), 4);
  assert.equal(lengthOfLIS([7, 7, 7, 7, 7, 7, 7]), 1);
  assert.equal(lengthOfLIS([5]), 1);
  assert.equal(lengthOfLIS([1, 2, 3, 4, 5]), 5);
});
