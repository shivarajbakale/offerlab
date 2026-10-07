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

// @rule every digit right of i was a 9 and is now 0; the +1 carry is still waiting at i
// @why Returns the digits of the number plus one; digits are stored most-significant first.
// @goal what are the digits of {digits.join("")} + 1?
export function plusOne(digits: number[]): number[] {
  // @why Copy the array so the input is not changed.
  // @phase Setup
  // @say Converting the digits to a number and back overflows once the array is longer than about 15 digits. Adding one only ever changes a run of trailing 9s plus one more digit, so work on the digits directly, right to left, the way you carry on paper.
  const res = [...digits];
  // @why Start from the last digit, because that is where adding one happens.
  // @phase Carry the +1 leftward
  // @yes The +1 is waiting at index {i} (digit {res[i]}).
  // @no The carry went past the leftmost digit: every digit was a 9.
  for (let i = res.length - 1; i >= 0; i--) {
    // @why A digit below 9 can take the +1 without any carry.
    // @yes {res[i]} + 1 = {res[i] + 1}, still a single digit, so the carry stops here.
    // @no 9 + 1 = 10: write 0 and carry 1 to the left.
    if (res[i] < 9) {
      // @why Add one.
      // @say Bump index {i} from {res[i]} to {res[i] + 1}. Every digit to its left is untouched.
      res[i]++; // @ask res[i] // @moment carry absorbed at index {i}
      // @why No carry left, so we are finished.
      // @returns {JSON.stringify(res)}: the carry was absorbed at index {i}, so nothing further left changes.
      return res;
    }
    // @why A 9 becomes 0 and passes a carry to the next digit on the left.
    // @say Index {i} becomes 0 and the carry moves to {i > 0 ? "index " + (i - 1) : "a new digit in front"}.
    res[i] = 0; // 9 + 1 -> 0, carry on
  }
  // @why Every digit was 9 (like 999), so we need a new leading 1.
  // @phase Answer
  // @returns {JSON.stringify([1].concat(res))}: {res.length === 1 ? "the only digit" : "all " + res.length + " digits"} rolled over to 0, so the number grows by one digit, a leading 1.
  return [1, ...res];
}

test("66. Plus One", () => {
  assert.deepEqual(plusOne([1, 2, 3]), [1, 2, 4]);
  assert.deepEqual(plusOne([4, 3, 2, 1]), [4, 3, 2, 2]);
  assert.deepEqual(plusOne([9]), [1, 0]);
  assert.deepEqual(plusOne([9, 9, 9]), [1, 0, 0, 0]);
  assert.deepEqual(plusOne([1, 9]), [2, 0]);
});
