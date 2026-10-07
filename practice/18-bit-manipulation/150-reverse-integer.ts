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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const INT_MAX = 2 ** 31 - 1; // 2147483647

const INT_MIN = -(2 ** 31); // -2147483648

export function reverse(x: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("7. Reverse Integer", () => {
  assert.equal(reverse(123), 321);
  assert.equal(reverse(-123), -321);
  assert.equal(reverse(120), 21);
  assert.equal(reverse(0), 0);
  assert.equal(reverse(1534236469), 0); // reversed overflows INT_MAX
  assert.equal(reverse(-2147483648), 0); // reversed overflows INT_MIN
});
