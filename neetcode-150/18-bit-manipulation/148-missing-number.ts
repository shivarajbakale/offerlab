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
 *
 * Pattern: bit-manipulation
 * Key insight: XOR all indices 0..n with all values: every present number appears twice
 *   and cancels, so only the missing one survives. Starting from n covers the index the
 *   loop never reaches.
 * Real world: Finding the one missing packet sequence number in a received batch, or the
 *   one unused ID in a fully allocated range, in O(1) memory.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule result is n xor every index and value seen so far; numbers present cancel in pairs
// @why Returns the one number from 0..n missing from `nums`.
// @goal which number from 0 to {nums.length} is missing from {JSON.stringify(nums)}?
export function missingNumber(nums: number[]): number {
  // @why Start with `n` (the array length), because the loop only covers indexes 0 to n-1.
  // @phase Setup: one list of every number that should be there
  // @say Sorting costs n log n and a set needs O(n) memory. Instead, XOR together every number that should be there (0..{nums.length}) and every number that is there. Each present number appears twice and cancels (x ^ x = 0), so only the missing one survives. The indices 0..{nums.length - 1} plus this {nums.length} give the full "should be there" list.
  let result = nums.length;
  // @why Visit every index.
  // @phase Pair up "should be there" with "is there"
  // @yes Index {i} adds {i} to the "should be" side, and nums[{i}] = {nums[i]} to the "is there" side.
  // @no Every index and value is folded in. Each number present met its twin from the 0..{nums.length} list.
  for (let i = 0; i < nums.length; i++) {
    // @why XOR in the index and the value at it. Numbers present show up twice and cancel, so the missing one is left.
    // @say {result} ^ {i} ^ {nums[i]} = {result ^ i ^ nums[i]}. Order doesn't matter for XOR, so {i} and {nums[i]} each cancel whenever their twin shows up, earlier or later. Only a number with no twin is left at the end.
    result ^= i ^ nums[i]; // @ask result
  }
  // @why The only number without a partner is the missing one.
  // @phase Answer
  // @returns {result}: it appeared only in the 0..{nums.length} list, never in the array, so nothing cancelled it. O(n) time, O(1) space.
  return result;
}

test("268. Missing Number", () => {
  assert.equal(missingNumber([3, 0, 1]), 2);
  assert.equal(missingNumber([0, 1]), 2);
  assert.equal(missingNumber([9, 6, 4, 2, 3, 5, 7, 0, 1]), 8);
  assert.equal(missingNumber([1]), 0); // zero missing
});
