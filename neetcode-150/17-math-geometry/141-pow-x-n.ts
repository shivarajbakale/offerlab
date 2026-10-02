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
 *
 * Approach: Fast exponentiation (binary exponentiation)
 *   x^n = (x^(n/2))^2, times one extra x when n is odd. Compute the half
 *   power once and square it, so there are only O(log n) multiplications.
 *   For negative n, compute x^|n| and take the reciprocal.
 *
 * Time: O(log n)   Space: O(log n) recursion
 *
 * Pattern: math
 * Key insight: x^n is (x^(n/2))^2, with one extra x when n is odd, so computing the half
 *   once halves the work each level. That gives O(log n) multiplications instead of n.
 * Real world: RSA and other public-key crypto compute huge modular powers with this same
 *   square-and-multiply method.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function myPow(x: number, n: number): number {
  const helper = (base: number, exp: number): number => {
    if (base === 0) return 0;
    if (exp === 0) return 1;
    const half = helper(base, Math.floor(exp / 2));
    return exp % 2 === 0 ? half * half : half * half * base;
  };

  const res = helper(x, Math.abs(n));
  return n >= 0 ? res : 1 / res;
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
