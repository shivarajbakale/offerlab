/**
 * 338. Counting Bits
 * Difficulty: Easy
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/counting-bits/
 *
 * Given an integer `n`, return an array `ans` of length n + 1 where ans[i]
 * is the number of 1 bits in the binary representation of i.
 *
 * Example 1:
 *   Input: n = 2
 *   Output: [0, 1, 1]
 *
 * Example 2:
 *   Input: n = 5
 *   Output: [0, 1, 1, 2, 1, 2]
 *
 * Constraints:
 *   0 <= n <= 10^5
 *
 * Approach: DP on the most significant bit
 *   Let `offset` be the largest power of two <= i. Then i = offset + (i -
 *   offset), so i has exactly one more 1 bit than (i - offset):
 *   dp[i] = 1 + dp[i - offset]. Double `offset` whenever i hits the next
 *   power of two.
 *
 * Time: O(n)   Space: O(n) for the output
 *
 * Pattern: bit-manipulation,dp-1d
 * Key insight: Removing the highest power of two from i drops exactly one 1 bit and leaves
 *   a smaller number whose count is already known, so dp[i] = 1 + dp[i - offset].
 * Real world: Building a popcount lookup table once (for example for all bytes) so later
 *   bit counts in a compression or chess engine are a single table read.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[i] is the bit count of i; offset is the highest power of two not above i
// @why Returns the number of 1 bits for every number from 0 to `n`.
// @goal how many 1 bits does each number from 0 to {n} have?
export function countBits(n: number): number[] {
  // @why `dp[i]` will hold the bit count of `i`. 0 has no 1 bits.
  // @phase Setup
  // @say Counting each number's bits from scratch costs up to 32 steps each. But every number is its highest 1 bit plus a smaller number whose count is already known, so each answer is one addition.
  const dp = new Array<number>(n + 1).fill(0);
  // @why `offset` is the biggest power of two that is not above `i`.
  let offset = 1;
  // @why Fill in each number using answers we already know.
  // @phase Each number reuses the count of a smaller one
  // @yes Next is {i} (binary {i.toString(2)}). Every number below it already has its count.
  // @no Every number from 0 to {n} has its count.
  for (let i = 1; i <= n; i++) {
    // @why When `i` reaches the next power of two, that becomes the new `offset`.
    // @yes {i} = 2 × {offset} is a power of two (binary {i.toString(2)}): a new, higher top bit starts here, so it becomes the offset.
    // @no {i} is below {offset * 2}, so its top bit is still {offset}.
    if (offset * 2 === i) offset = i; // @ask offset
    // @why `i` is the high bit (`offset`) plus the smaller number `i - offset`, so add one to that count.
    // @say {i} = {offset} + {i - offset} (binary {i.toString(2)} = {offset.toString(2)} + {(i - offset).toString(2)}). The top bit gives 1, and {i - offset} has {dp[i - offset]}, already known: 1 + {dp[i - offset]} = {1 + dp[i - offset]}.
    const bits = 1 + dp[i - offset]; // @ask bits
    // @why Store it so bigger numbers can reuse it.
    // @then {i} has {dp[i]} {dp[i] === 1 ? "bit" : "bits"} set.
    dp[i] = bits;
  }
  // @why Every number from 0 to `n` now has its count.
  // @phase Answer
  // @returns {JSON.stringify(dp)}: each count came from one lookup and one addition, O(n) total.
  return dp;
}

test("338. Counting Bits", () => {
  assert.deepEqual(countBits(2), [0, 1, 1]);
  assert.deepEqual(countBits(5), [0, 1, 1, 2, 1, 2]);
  assert.deepEqual(countBits(0), [0]);
  assert.deepEqual(countBits(8), [0, 1, 1, 2, 1, 2, 2, 3, 1]);
});
