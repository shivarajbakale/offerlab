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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function getSum(a: number, b: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("371. Sum of Two Integers", () => {
  assert.equal(getSum(1, 2), 3);
  assert.equal(getSum(2, 3), 5);
  assert.equal(getSum(-1, 1), 0); // negative + positive
  assert.equal(getSum(-12, -8), -20);
});
