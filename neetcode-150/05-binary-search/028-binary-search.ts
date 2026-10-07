/**
 * 704. Binary Search
 * Difficulty: Easy
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/binary-search/
 *
 * Given an array of integers `nums` sorted in ascending order and an integer
 * `target`, return the index of `target` in `nums`, or -1 if it is absent.
 * The algorithm must run in O(log n) time.
 *
 * Example 1:
 *   Input: nums = [-1, 0, 3, 5, 9, 12], target = 9
 *   Output: 4
 *
 * Example 2:
 *   Input: nums = [-1, 0, 3, 5, 9, 12], target = 2
 *   Output: -1
 *
 * Constraints:
 *   1 <= nums.length <= 10^4
 *   -10^4 < nums[i], target < 10^4
 *   All integers in nums are unique and sorted ascending.
 *
 * Approach: Classic binary search
 *   Keep a closed window [lo, hi]. Compare the middle element with the
 *   target and discard the half that cannot contain it.
 *
 * Time: O(log n)   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: Because the array is sorted, one comparison with the middle tells which
 *   half cannot contain the target, so half the remaining range is discarded each step.
 * Real world: Database B-tree indexes and sorted SSTable files binary search their keys
 *   to locate a row in O(log n).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz range:lo..hi@mid
// @rule lo..hi always contains the target if it is in the array
// @why Returns the index of `target` in the sorted array, or -1.
export function search(nums: number[], target: number): number {
  // @why `lo` and `hi` bound the part of the array where the target could still be.
  let lo = 0;
  let hi = nums.length - 1;
  // @why Keep going while at least one position is left to check.
  while (lo <= hi) {
    // @why Look at the middle so each step throws away half of the range.
    const mid = lo + ((hi - lo) >> 1); // @say Probe the middle of the remaining range [{lo}, {hi}]
    // @why Found it, so return its index.
    if (nums[mid] === target) return mid; // @moment probe {nums[mid]} // @say Is the middle value the target {target}?
    // @why Sorted array: a too-small middle means the target can only be to the right, otherwise to the left.
    if (nums[mid] < target) lo = mid + 1; // @ask lo // @say Sorted: if {nums[mid]} < {target}, the target can only be to the right
    else hi = mid - 1; // @ask hi // @say Middle is too big, so discard it and everything right of it
  }
  // @why The range is empty, so the target is not there.
  return -1;
}

test("704. Binary Search", () => {
  assert.equal(search([-1, 0, 3, 5, 9, 12], 9), 4);
  assert.equal(search([-1, 0, 3, 5, 9, 12], 2), -1);
  assert.equal(search([5], 5), 0);
  assert.equal(search([5], -5), -1);
});
