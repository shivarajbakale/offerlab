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
 *
 * Approach: Kadane's algorithm
 *   Keep a running sum of the current subarray. If the running sum ever goes
 *   negative, it can only hurt whatever comes next, so drop it and start
 *   fresh at the next element. Track the best sum seen along the way.
 *
 * Time: O(n)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxSubArray(nums: number[]): number {
  let best = nums[0];
  let cur = 0;
  for (const n of nums) {
    if (cur < 0) cur = 0; // negative prefix never helps
    cur += n;
    best = Math.max(best, cur);
  }
  return best;
}

test("53. Maximum Subarray", () => {
  assert.equal(maxSubArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]), 6);
  assert.equal(maxSubArray([1]), 1);
  assert.equal(maxSubArray([5, 4, -1, 7, 8]), 23);
  assert.equal(maxSubArray([-3, -1, -2]), -1); // all negative
});
