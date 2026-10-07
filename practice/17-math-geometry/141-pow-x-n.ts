/**
 * 50. Pow(x, n)
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/powx-n/
 *
 * Implement pow(x, n), which computes x raised to the integer power n
 * (x^n), without using a built-in power function.
 *
 * Example 1:
 *   Input: x = 2.00000, n = 10
 *   Output: 1024.00000
 *
 * Example 2:
 *   Input: x = 2.10000, n = 3
 *   Output: 9.26100
 *
 * Example 3:
 *   Input: x = 2.00000, n = -2
 *   Output: 0.25000   (2^-2 = 1/4)
 *
 * Constraints:
 *   -100.0 < x < 100.0
 *   -2^31 <= n <= 2^31 - 1
 *   n is an integer; either x != 0 or n > 0
 *   -10^4 <= x^n <= 10^4
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function myPow(x: number, n: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-5;

test("50. Pow(x, n)", () => {
  assert.ok(close(myPow(2, 10), 1024));
  assert.ok(close(myPow(2.1, 3), 9.261));
  assert.ok(close(myPow(2, -2), 0.25));
  assert.equal(myPow(5, 0), 1);
  assert.ok(close(myPow(1, -2147483648), 1));
  assert.ok(close(myPow(-2, 3), -8));
});
