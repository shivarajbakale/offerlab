/**
 * 167. Two Sum II - Input Array Is Sorted
 * Difficulty: Medium
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
 *
 * Given a 1-indexed array `numbers` sorted in non-decreasing order, find two
 * numbers that add up to `target` and return their indices [index1, index2]
 * (1-indexed, index1 < index2). Exactly one solution exists, the same element
 * may not be used twice, and only constant extra space may be used.
 *
 * Example 1:
 *   Input: numbers = [2, 7, 11, 15], target = 9
 *   Output: [1, 2]
 *
 * Example 2:
 *   Input: numbers = [2, 3, 4], target = 6
 *   Output: [1, 3]
 *
 * Example 3:
 *   Input: numbers = [-1, 0], target = -1
 *   Output: [1, 2]
 *
 * Constraints:
 *   2 <= numbers.length <= 3 * 10^4
 *   -1000 <= numbers[i], target <= 1000
 *   Exactly one valid answer exists.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function twoSum(numbers: number[], target: number): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("167. Two Sum II - Input Array Is Sorted", () => {
  assert.deepEqual(twoSum([2, 7, 11, 15], 9), [1, 2]);
  assert.deepEqual(twoSum([2, 3, 4], 6), [1, 3]);
  assert.deepEqual(twoSum([-1, 0], -1), [1, 2]);
  assert.deepEqual(twoSum([1, 2, 3, 4, 4, 9], 8), [4, 5]);
});
