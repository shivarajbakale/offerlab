/**
 * 43. Multiply Strings
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/multiply-strings/
 *
 * Given two non-negative integers `num1` and `num2` as strings, return their
 * product, also as a string. You may not use a big-integer library or
 * convert the inputs to integers directly.
 *
 * Example 1:
 *   Input: num1 = "2", num2 = "3"
 *   Output: "6"
 *
 * Example 2:
 *   Input: num1 = "123", num2 = "456"
 *   Output: "56088"
 *
 * Constraints:
 *   1 <= num1.length, num2.length <= 200
 *   num1 and num2 consist of digits only
 *   Neither has leading zeros, except the number 0 itself
 *
 * Approach: Grade-school multiplication into a digit array
 *   The product has at most m + n digits. Multiply digit i of num1 by digit
 *   j of num2 (both indexed from the right) and add it into position i + j
 *   of a result array (least-significant first), carrying overflow into
 *   position i + j + 1. Finally strip leading zeros and reverse.
 *
 * Time: O(m * n)   Space: O(m + n)
 *
 * Pattern: math
 * Key insight: Digit i of num1 times digit j of num2 always lands in position i + j of the
 *   product (counted from the right). Accumulating every pair there and carrying as you go
 *   is grade-school multiplication with no big-integer type.
 * Real world: Arbitrary-precision libraries (like BigInt implementations) multiply digit
 *   arrays this way when numbers exceed native integer size.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Multiplies two numbers given as strings, like on paper, because they may be too big for a number.
export function multiply(num1: string, num2: string): string {
  // @why Anything times 0 is 0; this also avoids a result like "000".
  if (num1 === "0" || num2 === "0") return "0";

  // @why Length of the first number.
  const m = num1.length;
  // @why Length of the second number.
  const n = num2.length;
  // @why The product has at most `m + n` digits. Slot `k` holds the digit worth 10^k.
  const res = new Array<number>(m + n).fill(0); // least-significant digit first

  // @why Take each digit of `num1` starting from the right.
  for (let i = 0; i < m; i++) {
    // @why Turn the character into its digit (the code for "0" is 48).
    const d1 = num1.charCodeAt(m - 1 - i) - 48;
    // @why Multiply it by each digit of `num2`, also from the right.
    for (let j = 0; j < n; j++) {
      // @why Turn the character into its digit.
      const d2 = num2.charCodeAt(n - 1 - j) - 48;
      // @why Digit `i` times digit `j` is worth 10^(i+j), so add it to that slot.
      res[i + j] += d1 * d2;
      // @why Whatever is 10 or more carries into the next slot.
      res[i + j + 1] += Math.floor(res[i + j] / 10);
      // @why Keep only the ones digit in this slot.
      res[i + j] %= 10;
    }
  }

  // @why Find the last real digit; the top slots may be unused zeros.
  let end = res.length - 1;
  // @why Move `end` down past the unused zeros, but keep at least one digit.
  while (end > 0 && res[end] === 0) end--; // drop leading zeros
  // @why Flip back to most-significant first and join into a string.
  return res.slice(0, end + 1).reverse().join("");
}

test("43. Multiply Strings", () => {
  assert.equal(multiply("2", "3"), "6");
  assert.equal(multiply("123", "456"), "56088");
  assert.equal(multiply("0", "9999"), "0");
  assert.equal(multiply("999", "999"), "998001");
  assert.equal(
    multiply("123456789123456789", "987654321987654321"),
    (123456789123456789n * 987654321987654321n).toString(),
  );
});
