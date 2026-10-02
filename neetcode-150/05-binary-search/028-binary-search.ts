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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function search(nums: number[], target: number): number {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

test("704. Binary Search", () => {
  assert.equal(search([-1, 0, 3, 5, 9, 12], 9), 4);
  assert.equal(search([-1, 0, 3, 5, 9, 12], 2), -1);
  assert.equal(search([5], 5), 0);
  assert.equal(search([5], -5), -1);
});
