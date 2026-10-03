/**
 * 66. Plus One
 * Difficulty: Easy
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/plus-one/
 *
 * You are given a large integer as an array `digits`, most significant digit
 * first, with no leading zeros. Increment the integer by one and return the
 * resulting array of digits.
 *
 * Example 1:
 *   Input: digits = [1, 2, 3]
 *   Output: [1, 2, 4]
 *
 * Example 2:
 *   Input: digits = [4, 3, 2, 1]
 *   Output: [4, 3, 2, 2]
 *
 * Example 3:
 *   Input: digits = [9]
 *   Output: [1, 0]
 *
 * Constraints:
 *   1 <= digits.length <= 100
 *   0 <= digits[i] <= 9
 *   digits has no leading zeros
 *
 * Approach: Carry from the right
 *   Walk from the last digit. A digit < 9 just increments and we are done.
 *   A 9 becomes 0 and the carry moves left. If every digit was 9, prepend 1.
 *
 * Time: O(n)   Space: O(1) (O(n) only in the all-nines case)
 *
 * Pattern: math
 * Key insight: Adding one only changes the trailing run of 9s plus the digit before it.
 *   Stop at the first digit below 9; only an all-9s number needs a new leading 1.
 * Real world: Big-number and odometer-style counters, such as incrementing a version
 *   string or a fixed-width sequence ID stored as digits.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns the digits of the number plus one; digits are stored most-significant first.
export function plusOne(digits: number[]): number[] {
  // @why Copy the array so the input is not changed.
  const res = [...digits];
  // @why Start from the last digit, because that is where adding one happens.
  for (let i = res.length - 1; i >= 0; i--) {
    // @why A digit below 9 can take the +1 without any carry.
    if (res[i] < 9) {
      // @why Add one.
      res[i]++;
      // @why No carry left, so we are finished.
      return res;
    }
    // @why A 9 becomes 0 and passes a carry to the next digit on the left.
    res[i] = 0; // 9 + 1 -> 0, carry on
  }
  // @why Every digit was 9 (like 999), so we need a new leading 1.
  return [1, ...res];
}

test("66. Plus One", () => {
  assert.deepEqual(plusOne([1, 2, 3]), [1, 2, 4]);
  assert.deepEqual(plusOne([4, 3, 2, 1]), [4, 3, 2, 2]);
  assert.deepEqual(plusOne([9]), [1, 0]);
  assert.deepEqual(plusOne([9, 9, 9]), [1, 0, 0, 0]);
  assert.deepEqual(plusOne([1, 9]), [2, 0]);
});
