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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function hammingWeight(n: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("191. Number of 1 Bits", () => {
  assert.equal(hammingWeight(11), 3);
  assert.equal(hammingWeight(128), 1);
  assert.equal(hammingWeight(2147483645), 30);
  assert.equal(hammingWeight(0xffffffff), 32); // all 32 bits (unsigned input)
});
