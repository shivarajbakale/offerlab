/**
 * 33. Search in Rotated Sorted Array
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/search-in-rotated-sorted-array/
 *
 * An ascending array of distinct integers has possibly been rotated at an
 * unknown pivot. Given the rotated array `nums` and `target`, return the
 * index of `target`, or -1 if it is not present, in O(log n) time.
 *
 * Example 1:
 *   Input: nums = [4, 5, 6, 7, 0, 1, 2], target = 0
 *   Output: 4
 *
 * Example 2:
 *   Input: nums = [4, 5, 6, 7, 0, 1, 2], target = 3
 *   Output: -1
 *
 * Example 3:
 *   Input: nums = [1], target = 0
 *   Output: -1
 *
 * Constraints:
 *   1 <= nums.length <= 5000
 *   -10^4 <= nums[i], target <= 10^4
 *   All values are unique.
 *
 * Approach: Binary search on the sorted half
 *   At every step at least one of [lo, mid] or [mid, hi] is sorted. Check
 *   whether the target falls inside the sorted half's range; if so search
 *   there, otherwise search the other half.
 *
 * Time: O(log n)   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: Any midpoint splits the rotated array into at least one sorted half, and
 *   with a sorted half a range check says for sure whether the target is there, so half
 *   can still be discarded.
 * Real world: Searching a ring buffer of time-ordered records whose start point has
 *   rotated, without first unrotating it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function search(nums: number[], target: number): number {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return mid;

    if (nums[lo] <= nums[mid]) {
      // Left half is sorted.
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {
      // Right half is sorted.
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}

test("33. Search in Rotated Sorted Array", () => {
  assert.equal(search([4, 5, 6, 7, 0, 1, 2], 0), 4);
  assert.equal(search([4, 5, 6, 7, 0, 1, 2], 3), -1);
  assert.equal(search([1], 0), -1);
  assert.equal(search([3, 1], 1), 1);
  assert.equal(search([5, 1, 3], 5), 0);
});
