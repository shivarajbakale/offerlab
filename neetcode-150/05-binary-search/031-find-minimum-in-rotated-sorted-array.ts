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
export function findMin(nums: number[]): number {
  // @why `lo` and `hi` bound where the minimum could be.
  let lo = 0;
  let hi = nums.length - 1;
  // @why Stop when one spot is left; that spot is the minimum.
  while (lo < hi) {
    // @why Look at the middle.
    const mid = (lo + hi) >> 1;
    // @why If the middle is bigger than the right end, the rotation break is to the right, so the min is right of `mid`.
    if (nums[mid] > nums[hi]) lo = mid + 1; // @ask lo
    // @why Otherwise the right part is sorted, so the min is at `mid` or to its left. Keep `mid` since it could be the min.
    else hi = mid; // @ask hi
  }
  // @why `lo` and `hi` meet at the minimum.
  return nums[lo];
}

test("153. Find Minimum in Rotated Sorted Array", () => {
  assert.equal(findMin([3, 4, 5, 1, 2]), 1);
  assert.equal(findMin([4, 5, 6, 7, 0, 1, 2]), 0);
  assert.equal(findMin([11, 13, 15, 17]), 11);
  assert.equal(findMin([1]), 1);
  assert.equal(findMin([2, 1]), 1);
});
