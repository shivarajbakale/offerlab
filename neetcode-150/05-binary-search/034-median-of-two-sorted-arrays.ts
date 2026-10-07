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

// @viz range:lo..hi@i
// @rule the correct count i of values taken from A always lies in lo..hi
// @why Finds the median of two sorted arrays in O(log) time by searching for the right split.
// @goal what is the median of {JSON.stringify(nums1)} and {JSON.stringify(nums2)} merged?
export function findMedianSortedArrays(nums1: number[], nums2: number[]): number {
  // @why Work on copies of the references so we can swap them.
  // @phase Setup: search the shorter array for where to cut it
  // @say Merging both arrays and taking the middle costs O(m + n). But the median only needs the merged array cut in half: the smaller half takes some i values from one array and the rest from the other. Pick i and the rest follows, so binary search for the i that makes a valid cut.
  let A = nums1;
  let B = nums2;
  // @why Search over the shorter array, which keeps the search small and `j` never negative.
  // @yes {JSON.stringify(A)} is longer, so swap: search the shorter one, so j = half − i can never go below 0 or past B's end.
  // @no {JSON.stringify(A)} is already the shorter (or equal) one, so search it directly.
  if (A.length > B.length) [A, B] = [B, A];

  // @why Total number of values.
  const total = A.length + B.length;
  // @why The left side of the split should hold this many values (one extra if the total is odd).
  // @say {total} values in all, so the left half holds {Math.floor((total + 1) / 2)}{total % 2 === 1 ? ", one more than the right, so the middle value lands on the left" : ", the same as the right"}.
  const half = Math.floor((total + 1) / 2);

  // @why `lo` and `hi` are the possible numbers of values taken from `A`.
  // @phase Binary search for how many values A gives the left half
  // @say A can give anywhere from 0 to {A.length} values to the left half.
  let lo = 0;
  let hi = A.length;
  // @why Binary search for the right split in `A`.
  // @yes {lo === hi ? "Only one count from A is left, " + lo + ", so try it." : "Counts " + lo + ".." + hi + " from A are still possible, so try the middle one."}
  // @no No count from A works, which only happens if an input was not sorted.
  while (lo <= hi) {
    // @why Take `i` values from `A` for the left side.
    // @say Try taking {(lo + hi) >> 1} {((lo + hi) >> 1) === 1 ? "value" : "values"} from A.
    const i = (lo + hi) >> 1; // elements taken from A
    // @why Take the rest of the left side from `B`.
    // @say The left half needs {half} values, so B gives the rest: {half} − {i} = {half - i}.
    const j = half - i; // elements taken from B // @ask j

    // @why Last value of A's left part; -Infinity if the left part is empty, so it never blocks.
    // @say A's last value on the left: {i > 0 ? A[i - 1] : "none, so use -Infinity, which can never be too big"}.
    const aLeft = i > 0 ? A[i - 1] : -Infinity;
    // @why First value of A's right part; Infinity if empty.
    // @say A's first value on the right: {i < A.length ? A[i] : "none, so use Infinity, which can never be too small"}.
    const aRight = i < A.length ? A[i] : Infinity;
    // @why Last value of B's left part, with the same empty-side trick.
    // @say B's last value on the left: {j > 0 ? B[j - 1] : "none, so use -Infinity"}.
    const bLeft = j > 0 ? B[j - 1] : -Infinity;
    // @why First value of B's right part.
    // @say B's first value on the right: {j < B.length ? B[j] : "none, so use Infinity"}.
    const bRight = j < B.length ? B[j] : Infinity;

    // @why The split is right when every left value is no bigger than every right value.
    // @phase Check the cut: answer from it, or move it
    // @say Each array is sorted on its own, so only the cross pairs can be out of order: A's left end against B's right start, and B's left end against A's right start.
    // @yes {aLeft} ≤ {bRight} and {bLeft} ≤ {aRight}: every value on the left is at most every value on the right, so this is exactly the merged array cut in half.
    // @no The cut is out of order: {aLeft > bRight ? aLeft + " (from A) > " + bRight + " (from B)" : bLeft + " (from B) > " + aRight + " (from A)"}, so this i is wrong.
    if (aLeft <= bRight && bLeft <= aRight) {
      // @why The biggest left value is the middle for an odd total.
      // @say The left half's largest value is max({aLeft}, {bLeft}) = {Math.max(aLeft, bLeft)}.
      const leftMax = Math.max(aLeft, bLeft); // @moment split at i={i}, j={j}
      // @why Odd total: the middle value is the answer.
      // @yes {total} is odd, so the left half has one extra value, and its largest is the middle one.
      // @no {total} is even, so the median sits between the two halves: average the left's largest and the right's smallest.
      // @returns {leftMax}: the middle of all {total} values.
      if (total % 2 === 1) return leftMax;
      // @why Even total: average the two middle values.
      // @returns ({leftMax} + {Math.min(aRight, bRight)}) / 2 = {(leftMax + Math.min(aRight, bRight)) / 2}, found in O(log(min(m, n))) steps.
      return (leftMax + Math.min(aRight, bRight)) / 2;
    }
    // @why A's left side reaches too far, so take fewer values from `A`.
    // @yes {aLeft} from A is too big to sit left of {bRight}, so A gave too many: try fewer than {i}.
    // @no {bLeft} from B is too big to sit left of {aRight}, so B gave too many, meaning A gave too few: try more than {i}.
    if (aLeft > bRight) hi = i - 1; // @ask hi
    // @why Otherwise take more values from `A`.
    else lo = i + 1; // @ask lo
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
