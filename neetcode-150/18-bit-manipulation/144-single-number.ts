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
 *
 * Approach: XOR everything
 *   x ^ x = 0 and x ^ 0 = x, and XOR is commutative. XOR-ing all numbers
 *   cancels every pair, leaving only the single number.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: bit-manipulation
 * Key insight: XOR cancels any value with itself and order does not matter, so XOR-ing
 *   everything removes every pair and leaves the single value, with no extra memory.
 * Real world: RAID-5 parity uses the same XOR property: XOR of all surviving blocks and
 *   the parity block recovers the one missing block.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function singleNumber(nums: number[]): number {
  let result = 0;
  for (const n of nums) result ^= n;
  return result;
}

test("136. Single Number", () => {
  assert.equal(singleNumber([2, 2, 1]), 1);
  assert.equal(singleNumber([4, 1, 2, 1, 2]), 4);
  assert.equal(singleNumber([1]), 1);
  assert.equal(singleNumber([-5, 3, 3]), -5); // negative value
});
