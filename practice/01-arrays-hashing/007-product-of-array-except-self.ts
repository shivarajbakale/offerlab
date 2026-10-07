/**
 * 238. Product of Array Except Self
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/product-of-array-except-self/
 *
 * Given an integer array `nums`, return an array `answer` where `answer[i]`
 * is the product of every element of `nums` except `nums[i]`. Solve it in
 * O(n) time without using division.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3, 4]
 *   Output: [24, 12, 8, 6]
 *
 * Example 2:
 *   Input: nums = [-1, 1, 0, -3, 3]
 *   Output: [0, 0, 9, 0, 0]
 *
 * Constraints:
 *   2 <= nums.length <= 10^5
 *   -30 <= nums[i] <= 30
 *   Every prefix/suffix product fits in a 32-bit integer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function productExceptSelf(nums: number[]): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("238. Product of Array Except Self", () => {
  assert.deepEqual(productExceptSelf([1, 2, 3, 4]), [24, 12, 8, 6]);
  assert.deepEqual(productExceptSelf([-1, 1, 0, -3, 3]), [0, 0, 9, 0, 0]);
  assert.deepEqual(productExceptSelf([0, 0]), [0, 0]);
  assert.deepEqual(productExceptSelf([2, 3]), [3, 2]);
});
