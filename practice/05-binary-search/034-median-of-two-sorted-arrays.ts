/**
 * 4. Median of Two Sorted Arrays
 * Difficulty: Hard
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/median-of-two-sorted-arrays/
 *
 * Given two sorted arrays `nums1` (size m) and `nums2` (size n), return the
 * median of the combined multiset. The overall run time must be
 * O(log(m + n)).
 *
 * Example 1:
 *   Input: nums1 = [1, 3], nums2 = [2]
 *   Output: 2.0
 *
 * Example 2:
 *   Input: nums1 = [1, 2], nums2 = [3, 4]
 *   Output: 2.5
 *
 * Constraints:
 *   0 <= m, n <= 1000
 *   1 <= m + n <= 2000
 *   -10^6 <= nums1[i], nums2[i] <= 10^6
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findMedianSortedArrays(nums1: number[], nums2: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("4. Median of Two Sorted Arrays", () => {
  assert.equal(findMedianSortedArrays([1, 3], [2]), 2);
  assert.equal(findMedianSortedArrays([1, 2], [3, 4]), 2.5);
  assert.equal(findMedianSortedArrays([], [1]), 1);
  assert.equal(findMedianSortedArrays([2], []), 2);
  assert.equal(findMedianSortedArrays([1, 2, 3, 4, 5], [6, 7, 8]), 4.5);
});
