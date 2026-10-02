/**
 * 268. Missing Number
 * Difficulty: Easy
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/missing-number/
 *
 * Given an array `nums` containing n distinct numbers taken from the range
 * [0, n], return the only number in that range missing from the array.
 *
 * Example 1:
 *   Input: nums = [3, 0, 1]
 *   Output: 2
 *
 * Example 2:
 *   Input: nums = [0, 1]
 *   Output: 2
 *
 * Example 3:
 *   Input: nums = [9, 6, 4, 2, 3, 5, 7, 0, 1]
 *   Output: 8
 *
 * Constraints:
 *   n == nums.length
 *   1 <= n <= 10^4
 *   0 <= nums[i] <= n, all distinct
 *
 * Approach: XOR indices with values
 *   XOR every index 0..n together with every value. Each number present
 *   appears twice (once as index, once as value) and cancels; the missing
 *   one appears only as an index and survives. Start from n since indices
 *   only cover 0..n-1.
 *
 * Time: O(n)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function missingNumber(nums: number[]): number {
  let result = nums.length;
  for (let i = 0; i < nums.length; i++) {
    result ^= i ^ nums[i];
  }
  return result;
}

test("268. Missing Number", () => {
  assert.equal(missingNumber([3, 0, 1]), 2);
  assert.equal(missingNumber([0, 1]), 2);
  assert.equal(missingNumber([9, 6, 4, 2, 3, 5, 7, 0, 1]), 8);
  assert.equal(missingNumber([1]), 0); // zero missing
});
