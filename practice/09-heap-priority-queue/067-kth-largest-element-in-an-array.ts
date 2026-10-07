/**
 * 215. Kth Largest Element in an Array
 * Difficulty: Medium
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/kth-largest-element-in-an-array/
 *
 * Given an integer array `nums` and an integer `k`, return the kth largest
 * element in the array (in sorted order, not the kth distinct element).
 * Try to solve it without sorting.
 *
 * Example 1:
 *   Input: nums = [3, 2, 1, 5, 6, 4], k = 2
 *   Output: 5
 *
 * Example 2:
 *   Input: nums = [3, 2, 3, 1, 2, 4, 5, 5, 6], k = 4
 *   Output: 4
 *
 * Constraints:
 *   1 <= k <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function findKthLargest(nums: number[], k: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("215. Kth Largest Element in an Array", () => {
  assert.equal(findKthLargest([3, 2, 1, 5, 6, 4], 2), 5);
  assert.equal(findKthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4), 4);
  assert.equal(findKthLargest([1], 1), 1);
  assert.equal(findKthLargest([-1, -1, -2], 3), -2);
});
