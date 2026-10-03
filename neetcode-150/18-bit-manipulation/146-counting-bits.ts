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

// @why Returns the number of 1 bits for every number from 0 to `n`.
export function countBits(n: number): number[] {
  // @why `dp[i]` will hold the bit count of `i`. 0 has no 1 bits.
  const dp = new Array<number>(n + 1).fill(0);
  // @why `offset` is the biggest power of two that is not above `i`.
  let offset = 1;
  // @why Fill in each number using answers we already know.
  for (let i = 1; i <= n; i++) {
    // @why When `i` reaches the next power of two, that becomes the new `offset`.
    if (offset * 2 === i) offset = i;
    // @why `i` is the high bit (`offset`) plus the smaller number `i - offset`, so add one to that count.
    dp[i] = 1 + dp[i - offset];
  }
  // @why Every number from 0 to `n` now has its count.
  return dp;
}

test("338. Counting Bits", () => {
  assert.deepEqual(countBits(2), [0, 1, 1]);
  assert.deepEqual(countBits(5), [0, 1, 1, 2, 1, 2]);
  assert.deepEqual(countBits(0), [0]);
  assert.deepEqual(countBits(8), [0, 1, 1, 2, 1, 2, 2, 3, 1]);
});
