/**
 * 128. Longest Consecutive Sequence
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/longest-consecutive-sequence/
 *
 * Given an unsorted integer array `nums`, return the length of the longest
 * run of consecutive integers (e.g. 1, 2, 3, 4) that can be formed from its
 * elements. The algorithm must run in O(n) time.
 *
 * Example 1:
 *   Input: nums = [100, 4, 200, 1, 3, 2]
 *   Output: 4   (1, 2, 3, 4)
 *
 * Example 2:
 *   Input: nums = [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]
 *   Output: 9
 *
 * Constraints:
 *   0 <= nums.length <= 10^5
 *   -10^9 <= nums[i] <= 10^9
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestConsecutive(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("128. Longest Consecutive Sequence", () => {
  assert.equal(longestConsecutive([100, 4, 200, 1, 3, 2]), 4);
  assert.equal(longestConsecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]), 9);
  assert.equal(longestConsecutive([]), 0);
  assert.equal(longestConsecutive([1, 2, 0, 1]), 3);
});
