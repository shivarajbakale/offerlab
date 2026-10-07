/**
 * 153. Find Minimum in Rotated Sorted Array
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/
 *
 * An array of unique integers sorted ascending has been rotated between 1 and
 * n times (e.g. [0,1,2,4,5,6,7] -> [4,5,6,7,0,1,2]). Return its minimum
 * element in O(log n) time.
 *
 * Example 1:
 *   Input: nums = [3, 4, 5, 1, 2]
 *   Output: 1
 *
 * Example 2:
 *   Input: nums = [4, 5, 6, 7, 0, 1, 2]
 *   Output: 0
 *
 * Example 3:
 *   Input: nums = [11, 13, 15, 17]
 *   Output: 11
 *
 * Constraints:
 *   1 <= nums.length <= 5000
 *   -5000 <= nums[i] <= 5000
 *   All integers are unique; nums is a rotated sorted array.
 *
 * Approach: Binary search against the right edge
 *   If nums[mid] > nums[hi], the drop (minimum) is strictly right of mid;
 *   otherwise mid..hi is sorted, so the minimum is at mid or to its left.
 *   Shrink until lo === hi.
 *
 * Time: O(log n)   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: Comparing nums[mid] with nums[hi] tells which side the rotation drop is
 *   on: if mid is larger, the minimum is right of mid, otherwise mid..hi is sorted and
 *   the minimum is at or left of mid.
 * Real world: Finding where a circular log buffer wraps around (its oldest entry) by
 *   binary searching sorted timestamps.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz range:lo..hi@mid
// @rule the minimum is always inside lo..hi
// @why Finds the smallest value in a sorted array that was rotated.
// @goal what is the smallest value in the rotated sorted array {JSON.stringify(nums)}?
export function findMin(nums: number[]): number {
  // @why `lo` and `hi` bound where the minimum could be.
  // @phase Setup: the minimum is somewhere in the whole array
  // @say Scanning all {nums.length} values finds the minimum in O(n). But a rotated sorted array is two sorted runs, and the minimum is where the second run starts. Comparing the middle with the right end tells you which run the middle is in, so you can halve the range.
  let lo = 0;
  let hi = nums.length - 1;
  // @why Stop when one spot is left; that spot is the minimum.
  // @phase Halve the range toward the rotation point
  // @yes Indices {lo}..{hi} still hold more than one candidate, so probe again.
  // @no lo and hi met at index {lo}. Every other index was ruled out, so nums[{lo}] = {nums[lo]} is the minimum.
  while (lo < hi) {
    // @why Look at the middle.
    // @say Probe index {(lo + hi) >> 1}, the middle of {lo}..{hi}.
    const mid = (lo + hi) >> 1;
    // @why If the middle is bigger than the right end, the rotation break is to the right, so the min is right of `mid`.
    // @say Compare the middle {nums[mid]} with the right end {nums[hi]}.
    // @yes {nums[mid]} > {nums[hi]}: values drop somewhere between {mid} and {hi}, so the rotation point, and the minimum, is right of {mid}. {nums[mid]} itself can't be the minimum, since {nums[hi]} is smaller.
    // @no {nums[mid]} ≤ {nums[hi]}: indices {mid}..{hi} rise in order with no drop, so nothing right of {mid} beats {nums[mid]}. The minimum is at {mid} or to its left, so keep {mid}.
    // @then {nums[mid] > nums[hi] ? (lo === hi ? "Only index " + lo + " is left." : "The minimum is in indices " + lo + ".." + hi + ".") : ""}
    if (nums[mid] > nums[hi]) lo = mid + 1; // @ask lo
    // @why Otherwise the right part is sorted, so the min is at `mid` or to its left. Keep `mid` since it could be the min.
    // @then {lo === hi ? "Only index " + lo + " is left." : "The minimum is in indices " + lo + ".." + hi + "."}
    else hi = mid; // @ask hi
  }
  // @why `lo` and `hi` meet at the minimum.
  // @phase Answer
  // @returns {nums[lo]}, at index {lo}: the start of the second sorted run, found in O(log n) probes.
  return nums[lo];
}

test("153. Find Minimum in Rotated Sorted Array", () => {
  assert.equal(findMin([3, 4, 5, 1, 2]), 1);
  assert.equal(findMin([4, 5, 6, 7, 0, 1, 2]), 0);
  assert.equal(findMin([11, 13, 15, 17]), 11);
  assert.equal(findMin([1]), 1);
  assert.equal(findMin([2, 1]), 1);
});
