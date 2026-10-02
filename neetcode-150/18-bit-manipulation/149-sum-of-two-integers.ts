/**
 * 371. Sum of Two Integers
 * Difficulty: Medium
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/sum-of-two-integers/
 *
 * Given two integers `a` and `b`, return their sum without using the
 * operators + or -.
 *
 * Example 1:
 *   Input: a = 1, b = 2
 *   Output: 3
 *
 * Example 2:
 *   Input: a = 2, b = 3
 *   Output: 5
 *
 * Constraints:
 *   -1000 <= a, b <= 1000
 *
 * Approach: XOR for sum, AND + shift for carry
 *   a ^ b adds bits without carrying; (a & b) << 1 is the carry. Repeat with
 *   (sum, carry) until the carry is 0.
 *   JS note: bitwise ops already work on 32-bit two's-complement signed ints,
 *   so negatives behave like Java/C++ and the carry eventually shifts out of
 *   bit 31 and becomes 0. (In Python you would need an explicit 0xFFFFFFFF
 *   mask; in JS the 32-bit truncation is built in.)
 *
 * Time: O(1) (at most 32 iterations)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function getSum(a: number, b: number): number {
  while (b !== 0) {
    const carry = (a & b) << 1;
    a = a ^ b;
    b = carry;
  }
  return a;
}

test("371. Sum of Two Integers", () => {
  assert.equal(getSum(1, 2), 3);
  assert.equal(getSum(2, 3), 5);
  assert.equal(getSum(-1, 1), 0); // negative + positive
  assert.equal(getSum(-12, -8), -20);
});
