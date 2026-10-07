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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function search(nums: number[], target: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("33. Search in Rotated Sorted Array", () => {
  assert.equal(search([4, 5, 6, 7, 0, 1, 2], 0), 4);
  assert.equal(search([4, 5, 6, 7, 0, 1, 2], 3), -1);
  assert.equal(search([1], 0), -1);
  assert.equal(search([3, 1], 1), 1);
  assert.equal(search([5, 1, 3], 5), 0);
});
