/**
 * 416. Partition Equal Subset Sum
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/partition-equal-subset-sum/
 *
 * Given an array of positive integers `nums`, return true if it can be split
 * into two subsets whose sums are equal.
 *
 * Example 1:
 *   Input: nums = [1, 5, 11, 5]
 *   Output: true   ([1, 5, 5] and [11])
 *
 * Example 2:
 *   Input: nums = [1, 2, 3, 5]
 *   Output: false
 *
 * Constraints:
 *   1 <= nums.length <= 200
 *   1 <= nums[i] <= 100
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canPartition(nums: number[]): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("416. Partition Equal Subset Sum", () => {
  assert.equal(canPartition([1, 5, 11, 5]), true);
  assert.equal(canPartition([1, 2, 3, 5]), false);
  assert.equal(canPartition([1]), false);
  assert.equal(canPartition([2, 2]), true);
});
