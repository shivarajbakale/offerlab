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

// @rule count is how many 1 bits have been cleared from x; x still holds the rest
// @why Returns how many bits in `n` are 1.
// @goal how many 1 bits are in {n >>> 0} (binary {(n >>> 0).toString(2)})?
export function hammingWeight(n: number): number {
  // @why `>>> 0` treats the number as unsigned 32-bit, so negative inputs do not loop forever.
  // @phase Setup
  // @say Checking all 32 bit positions one by one always takes 32 steps. Instead, jump straight from one 1 bit to the next: the loop runs once per 1 bit, and zeros cost nothing.
  let x = n >>> 0;
  // @why Number of 1 bits found so far.
  let count = 0;
  // @why Stop when no 1 bits remain.
  // @phase Clear the lowest 1 bit until none are left
  // @yes x = {x.toString(2)} still has a 1 bit, so there is at least one more to count.
  // @no x is 0: every 1 bit has been cleared and counted.
  while (x !== 0) {
    // @why `x & (x - 1)` switches off the lowest 1 bit, so each loop removes exactly one 1.
    // @say Subtracting 1 flips the lowest 1 bit to 0 and every 0 below it to 1: {x.toString(2)} − 1 = {(x - 1).toString(2).padStart(x.toString(2).length, "0")}. ANDing the two keeps only the bits above, so exactly one 1 bit disappears: {((x & (x - 1)) >>> 0).toString(2).padStart(x.toString(2).length, "0")}.
    x = (x & (x - 1)) >>> 0; // @ask x // @moment clear lowest 1 bit of {x} // drop lowest set bit, keep unsigned
    // @why We removed one 1 bit, so count it.
    // @then {count} {count === 1 ? "bit" : "bits"} cleared, {x === 0 ? "none" : x.toString(2)} left.
    count++; // @ask count
  }
  // @why The count is the number of loops it took to clear all the bits.
  // @phase Answer
  // @returns {count}: one loop per 1 bit, so {count} {count === 1 ? "loop" : "loops"} instead of 32.
  return count;
}

test("191. Number of 1 Bits", () => {
  assert.equal(hammingWeight(11), 3);
  assert.equal(hammingWeight(128), 1);
  assert.equal(hammingWeight(2147483645), 30);
  assert.equal(hammingWeight(0xffffffff), 32); // all 32 bits (unsigned input)
});
