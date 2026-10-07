/**
 * 190. Reverse Bits
 * Difficulty: Easy
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/reverse-bits/
 *
 * Reverse the bits of a given 32-bit unsigned integer and return the result
 * as an unsigned integer.
 *
 * Example 1:
 *   Input:  n = 43261596    (00000010100101000001111010011100)
 *   Output: 964176192       (00111001011110000010100101000000)
 *
 * Example 2:
 *   Input:  n = 4294967293  (11111111111111111111111111111101)
 *   Output: 3221225471      (10111111111111111111111111111111)
 *
 * Constraints:
 *   The input is a 32-bit unsigned integer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function reverseBits(n: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("190. Reverse Bits", () => {
  assert.equal(reverseBits(43261596), 964176192);
  assert.equal(reverseBits(4294967293), 3221225471);
  assert.equal(reverseBits(0), 0);
  assert.equal(reverseBits(1), 2147483648); // low bit moves to bit 31
});
