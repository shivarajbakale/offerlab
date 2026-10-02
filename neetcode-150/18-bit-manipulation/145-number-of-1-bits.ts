/**
 * 191. Number of 1 Bits
 * Difficulty: Easy
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/number-of-1-bits/
 *
 * Given a positive integer `n`, return the number of set bits (1s) in its
 * binary representation (also known as the Hamming weight).
 *
 * Example 1:
 *   Input: n = 11   (binary 1011)
 *   Output: 3
 *
 * Example 2:
 *   Input: n = 128  (binary 10000000)
 *   Output: 1
 *
 * Example 3:
 *   Input: n = 2147483645  (binary 1111111111111111111111111111101)
 *   Output: 30
 *
 * Constraints:
 *   1 <= n <= 2^31 - 1
 *
 * Approach: Clear the lowest set bit
 *   n & (n - 1) removes the lowest 1 bit, so count how many times we can do
 *   that before n becomes 0. Loops once per set bit.
 *   JS note: bitwise ops coerce to 32-bit SIGNED ints, so an input like
 *   0xFFFFFFFF would become -1. We first apply `>>> 0` to treat n as an
 *   unsigned 32-bit value; `n & (n - 1)` still clears the low bit correctly
 *   either way, and the loop terminates when n reaches 0.
 *
 * Time: O(1) (at most 32 iterations)   Space: O(1)
 *
 * Pattern: bit-manipulation
 * Key insight: n & (n - 1) clears exactly the lowest set bit, so looping until n is 0 runs
 *   once per 1 bit instead of once per bit position.
 * Real world: Counting set bits (popcount) is used to count permissions in a bitmask,
 *   compute Hamming distance between hashes, or count filled slots in a bitmap index.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function hammingWeight(n: number): number {
  let x = n >>> 0;
  let count = 0;
  while (x !== 0) {
    x = (x & (x - 1)) >>> 0; // drop lowest set bit, keep unsigned
    count++;
  }
  return count;
}

test("191. Number of 1 Bits", () => {
  assert.equal(hammingWeight(11), 3);
  assert.equal(hammingWeight(128), 1);
  assert.equal(hammingWeight(2147483645), 30);
  assert.equal(hammingWeight(0xffffffff), 32); // all 32 bits (unsigned input)
});
