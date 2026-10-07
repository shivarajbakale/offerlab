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

// @rule helper(base, exp) returns base^exp, built by squaring helper(base, floor(exp/2))
// @why Returns `x` raised to the power `n`, using fast exponentiation.
// @goal what is {x} to the power {n}?
export function myPow(x: number, n: number): number {
  // @why Helper that works with a non-negative exponent, so we handle the sign once at the end.
  // @phase Setup: a helper for non-negative powers
  // @say Multiplying {x} by itself {Math.abs(n)} times is O(n), far too slow for exponents near two billion. But x^e = (x^(e/2))², so one answer for half the exponent gives the full one with a single multiply, and the exponent halves at every level: O(log n).
  // @goal what is {base} to the power {exp}?
  const helper = (base: number, exp: number): number => {
    // @why Zero to any positive power is zero; this also avoids pointless work.
    // @phase Halve the exponent, then square
    // @yes The base is 0, and 0 times anything is 0, so there's nothing to compute.
    // @no Base {base} is not 0.
    // @returns 0: zero to a positive power is zero.
    if (base === 0) return 0;
    // @why Anything to the power 0 is 1. This is where the recursion stops.
    // @yes The exponent reached 0: the smallest case, answered without any multiplying.
    // @no Exponent {exp} is still positive, so solve half of it first.
    // @returns 1: any number to the power 0 is 1, the empty product the squarings above will build on.
    if (exp === 0) return 1;
    // @why Solve for half the exponent first; it halves the work each time (O(log n)).
    // @say Ask for {base}^{Math.floor(exp / 2)}, half of {exp} rounded down.
    // @then {base}^{Math.floor(exp / 2)} = {half}.
    const half = helper(base, Math.floor(exp / 2));
    // @why Even exponent: two halves multiply. Odd exponent: one extra `base` is left over.
    // @say {exp % 2 === 0 ? exp + " is even, so square the half: " + half + " × " + half + " = " + half * half + "." : exp + " is odd, so halving dropped one factor: " + half + " × " + half + " × " + base + " = " + half * half * base + "."}
    const p = exp % 2 === 0 ? half * half : half * half * base; // @ask p // @moment base^{exp} from half {half}
    // @why This call's power, handed back up to the caller.
    // @returns {p} = {base}^{exp}, built with {exp % 2 === 0 ? "one multiply" : "two multiplies"} on top of the half.
    return p;
  };

  // @why Compute with the absolute value of `n`.
  // @phase Run it, then fix the sign
  // @say Compute {x}^{Math.abs(n)} first{n < 0 ? "; the negative sign is handled after" : ""}.
  // @then {x}^{Math.abs(n)} = {res}.
  const res = helper(x, Math.abs(n)); // @ask res
  // @why A negative power is one divided by the positive power.
  // @returns {n >= 0 ? res + ": the exponent was not negative, so the helper's answer stands. About log2(n) levels of recursion." : 1 / res + ": a negative power is 1 divided by the positive one, 1 / " + res + "."}
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
