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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function countBits(n: number): number[] {
  const dp = new Array<number>(n + 1).fill(0);
  let offset = 1;
  for (let i = 1; i <= n; i++) {
    if (offset * 2 === i) offset = i;
    dp[i] = 1 + dp[i - offset];
  }
  return dp;
}

test("338. Counting Bits", () => {
  assert.deepEqual(countBits(2), [0, 1, 1]);
  assert.deepEqual(countBits(5), [0, 1, 1, 2, 1, 2]);
  assert.deepEqual(countBits(0), [0]);
  assert.deepEqual(countBits(8), [0, 1, 1, 2, 1, 2, 2, 3, 1]);
});
