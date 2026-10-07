/**
 * 136. Single Number
 * Difficulty: Easy
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/single-number/
 *
 * Given a non-empty integer array `nums` where every element appears twice
 * except for one, return the element that appears only once. Use linear
 * time and constant extra space.
 *
 * Example 1:
 *   Input: nums = [2, 2, 1]
 *   Output: 1
 *
 * Example 2:
 *   Input: nums = [4, 1, 2, 1, 2]
 *   Output: 4
 *
 * Example 3:
 *   Input: nums = [1]
 *   Output: 1
 *
 * Constraints:
 *   1 <= nums.length <= 3 * 10^4
 *   -3 * 10^4 <= nums[i] <= 3 * 10^4
 *   Every element appears twice except one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function singleNumber(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("136. Single Number", () => {
  assert.equal(singleNumber([2, 2, 1]), 1);
  assert.equal(singleNumber([4, 1, 2, 1, 2]), 4);
  assert.equal(singleNumber([1]), 1);
  assert.equal(singleNumber([-5, 3, 3]), -5); // negative value
});
