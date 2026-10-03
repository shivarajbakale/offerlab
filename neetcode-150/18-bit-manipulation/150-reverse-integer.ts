/**
 * 7. Reverse Integer
 * Difficulty: Medium
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/reverse-integer/
 *
 * Given a signed 32-bit integer `x`, return x with its digits reversed. If
 * reversing causes the value to go outside the signed 32-bit range
 * [-2^31, 2^31 - 1], return 0. Assume the environment cannot store 64-bit
 * integers.
 *
 * Example 1:
 *   Input: x = 123
 *   Output: 321
 *
 * Example 2:
 *   Input: x = -123
 *   Output: -321
 *
 * Example 3:
 *   Input: x = 120
 *   Output: 21
 *
 * Constraints:
 *   -2^31 <= x <= 2^31 - 1
 *
 * Approach: Pop and push digits with an overflow check
 *   Repeatedly pop the last digit (x % 10, truncating division) and push it
 *   onto the result (res * 10 + digit). Before pushing, check that the result
 *   would stay within range:
 *     res > MAX / 10, or res === floor(MAX / 10) and digit > 7  -> overflow
 *     res < MIN / 10, or res === ceil(MIN / 10) and digit < -8  -> overflow
 *   JS note: JS numbers are 64-bit floats, so the multiplication would NOT
 *   overflow on its own; we check explicitly to honor the 32-bit contract.
 *   `%` in JS keeps the sign of the dividend and Math.trunc rounds toward 0,
 *   so negative inputs work without special-casing.
 *
 * Time: O(log |x|)   Space: O(1)
 *
 * Pattern: math
 * Key insight: Digits are popped with % 10 and pushed with res * 10 + digit. Overflow can
 *   be caught before it happens by comparing res against MAX / 10 (and the last digit)
 *   instead of computing a value that does not fit.
 * Real world: Parsers such as atoi or JSON number readers check for 32-bit overflow before
 *   each multiply-by-10 so they can reject out-of-range input safely.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Largest signed 32-bit integer.
const INT_MAX = 2 ** 31 - 1; // 2147483647
// @why Smallest signed 32-bit integer.
const INT_MIN = -(2 ** 31); // -2147483648

// @why Returns `x` with its digits reversed, or 0 if the result would not fit in 32 bits.
export function reverse(x: number): number {
  // @why The most `res` can be before adding one more digit and still not go past the max.
  const maxDiv = Math.trunc(INT_MAX / 10); // 214748364
  // @why The same limit for the negative side.
  const minDiv = Math.trunc(INT_MIN / 10); // -214748364
  // @why The reversed number built so far.
  let res = 0;
  // @why Keep taking digits until none are left.
  while (x !== 0) {
    // @why The last digit of `x`; works for negatives too, keeping the sign.
    const digit = x % 10;
    // @why Chop the last digit off, rounding toward zero.
    x = Math.trunc(x / 10);

    // @why If `res * 10 + digit` would go above the max, return 0 before it overflows.
    if (res > maxDiv || (res === maxDiv && digit > INT_MAX % 10)) return 0;
    // @why Same check for going below the min.
    if (res < minDiv || (res === minDiv && digit < INT_MIN % 10)) return 0;

    // @why Push the digit onto the end of the reversed number.
    res = res * 10 + digit;
  }
  // @why The reversed number fit in range.
  return res;
}

test("7. Reverse Integer", () => {
  assert.equal(reverse(123), 321);
  assert.equal(reverse(-123), -321);
  assert.equal(reverse(120), 21);
  assert.equal(reverse(0), 0);
  assert.equal(reverse(1534236469), 0); // reversed overflows INT_MAX
  assert.equal(reverse(-2147483648), 0); // reversed overflows INT_MIN
});
