/**
 * 287. Find the Duplicate Number
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/find-the-duplicate-number/
 *
 * Given an array `nums` of n + 1 integers where each value is in [1, n],
 * exactly one value is repeated (possibly more than twice). Return that
 * value without modifying the array and using only O(1) extra space.
 *
 * Example 1:
 *   Input: nums = [1, 3, 4, 2, 2]
 *   Output: 2
 *
 * Example 2:
 *   Input: nums = [3, 1, 3, 4, 2]
 *   Output: 3
 *
 * Example 3:
 *   Input: nums = [3, 3, 3, 3, 3]
 *   Output: 3
 *
 * Constraints:
 *   1 <= n <= 10^5
 *   nums.length == n + 1
 *   1 <= nums[i] <= n
 *   Exactly one integer appears two or more times.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findDuplicate(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("287. Find the Duplicate Number", () => {
  assert.equal(findDuplicate([1, 3, 4, 2, 2]), 2);
  assert.equal(findDuplicate([3, 1, 3, 4, 2]), 3);
  assert.equal(findDuplicate([3, 3, 3, 3, 3]), 3);
  assert.equal(findDuplicate([1, 1]), 1);
  assert.equal(findDuplicate([2, 5, 9, 6, 9, 3, 8, 9, 7, 1]), 9);
});
