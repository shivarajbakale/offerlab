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
 *
 * Approach: Binary search the partition of the shorter array
 *   Let A be the shorter array. Choose i elements from A and j = half - i
 *   from B for the "left half". The partition is correct when
 *   A[i-1] <= B[j] and B[j-1] <= A[i]. Binary search i; out-of-range
 *   neighbours act as -Infinity / +Infinity. The median then comes from the
 *   max of the left side and min of the right side.
 *
 * Time: O(log(min(m, n)))   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: The median splits both arrays into a left half and right half. Choosing i
 *   from the shorter array fixes j from the other, and the cross-checks A[i-1] <= B[j]
 *   and B[j-1] <= A[i] say which way i must move.
 * Real world: Computing a combined median latency from two sorted shards without merging
 *   their full data.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findMedianSortedArrays(nums1: number[], nums2: number[]): number {
  let A = nums1;
  let B = nums2;
  if (A.length > B.length) [A, B] = [B, A];

  const total = A.length + B.length;
  const half = Math.floor((total + 1) / 2);

  let lo = 0;
  let hi = A.length;
  while (lo <= hi) {
    const i = (lo + hi) >> 1; // elements taken from A
    const j = half - i; // elements taken from B

    const aLeft = i > 0 ? A[i - 1] : -Infinity;
    const aRight = i < A.length ? A[i] : Infinity;
    const bLeft = j > 0 ? B[j - 1] : -Infinity;
    const bRight = j < B.length ? B[j] : Infinity;

    if (aLeft <= bRight && bLeft <= aRight) {
      const leftMax = Math.max(aLeft, bLeft);
      if (total % 2 === 1) return leftMax;
      return (leftMax + Math.min(aRight, bRight)) / 2;
    }
    if (aLeft > bRight) hi = i - 1;
    else lo = i + 1;
  }
  throw new Error("Input arrays must be sorted");
}

test("4. Median of Two Sorted Arrays", () => {
  assert.equal(findMedianSortedArrays([1, 3], [2]), 2);
  assert.equal(findMedianSortedArrays([1, 2], [3, 4]), 2.5);
  assert.equal(findMedianSortedArrays([], [1]), 1);
  assert.equal(findMedianSortedArrays([2], []), 2);
  assert.equal(findMedianSortedArrays([1, 2, 3, 4, 5], [6, 7, 8]), 4.5);
});
