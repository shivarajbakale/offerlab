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

// @why Finds the median of two sorted arrays in O(log) time by searching for the right split.
export function findMedianSortedArrays(nums1: number[], nums2: number[]): number {
  // @why Work on copies of the references so we can swap them.
  let A = nums1;
  let B = nums2;
  // @why Search over the shorter array, which keeps the search small and `j` never negative.
  if (A.length > B.length) [A, B] = [B, A];

  // @why Total number of values.
  const total = A.length + B.length;
  // @why The left side of the split should hold this many values (one extra if the total is odd).
  const half = Math.floor((total + 1) / 2);

  // @why `lo` and `hi` are the possible numbers of values taken from `A`.
  let lo = 0;
  let hi = A.length;
  // @why Binary search for the right split in `A`.
  while (lo <= hi) {
    // @why Take `i` values from `A` for the left side.
    const i = (lo + hi) >> 1; // elements taken from A
    // @why Take the rest of the left side from `B`.
    const j = half - i; // elements taken from B

    // @why Last value of A's left part; -Infinity if the left part is empty, so it never blocks.
    const aLeft = i > 0 ? A[i - 1] : -Infinity;
    // @why First value of A's right part; Infinity if empty.
    const aRight = i < A.length ? A[i] : Infinity;
    // @why Last value of B's left part, with the same empty-side trick.
    const bLeft = j > 0 ? B[j - 1] : -Infinity;
    // @why First value of B's right part.
    const bRight = j < B.length ? B[j] : Infinity;

    // @why The split is right when every left value is no bigger than every right value.
    if (aLeft <= bRight && bLeft <= aRight) {
      // @why The biggest left value is the middle for an odd total.
      const leftMax = Math.max(aLeft, bLeft);
      // @why Odd total: the middle value is the answer.
      if (total % 2 === 1) return leftMax;
      // @why Even total: average the two middle values.
      return (leftMax + Math.min(aRight, bRight)) / 2;
    }
    // @why A's left side reaches too far, so take fewer values from `A`.
    if (aLeft > bRight) hi = i - 1;
    // @why Otherwise take more values from `A`.
    else lo = i + 1;
  }
  // @why Cannot happen when the input is sorted.
  throw new Error("Input arrays must be sorted");
}

test("4. Median of Two Sorted Arrays", () => {
  assert.equal(findMedianSortedArrays([1, 3], [2]), 2);
  assert.equal(findMedianSortedArrays([1, 2], [3, 4]), 2.5);
  assert.equal(findMedianSortedArrays([], [1]), 1);
  assert.equal(findMedianSortedArrays([2], []), 2);
  assert.equal(findMedianSortedArrays([1, 2, 3, 4, 5], [6, 7, 8]), 4.5);
});
