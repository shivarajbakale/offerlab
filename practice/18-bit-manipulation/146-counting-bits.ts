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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function countBits(n: number): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("338. Counting Bits", () => {
  assert.deepEqual(countBits(2), [0, 1, 1]);
  assert.deepEqual(countBits(5), [0, 1, 1, 2, 1, 2]);
  assert.deepEqual(countBits(0), [0]);
  assert.deepEqual(countBits(8), [0, 1, 1, 2, 1, 2, 2, 3, 1]);
});
