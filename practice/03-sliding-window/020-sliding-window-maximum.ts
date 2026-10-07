/**
 * 239. Sliding Window Maximum
 * Difficulty: Hard
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/sliding-window-maximum/
 *
 * Given an integer array `nums` and a window size `k` that slides from left
 * to right one position at a time, return an array of the maximum value in
 * each window.
 *
 * Example 1:
 *   Input: nums = [1, 3, -1, -3, 5, 3, 6, 7], k = 3
 *   Output: [3, 3, 5, 5, 6, 7]
 *
 * Example 2:
 *   Input: nums = [1], k = 1
 *   Output: [1]
 *
 * Constraints:
 *   1 <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 *   1 <= k <= nums.length
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxSlidingWindow(nums: number[], k: number): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("239. Sliding Window Maximum", () => {
  assert.deepEqual(maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3), [3, 3, 5, 5, 6, 7]);
  assert.deepEqual(maxSlidingWindow([1], 1), [1]);
  assert.deepEqual(maxSlidingWindow([9, 8, 7, 6], 2), [9, 8, 7]);
  assert.deepEqual(maxSlidingWindow([1, -1], 2), [1]);
});
