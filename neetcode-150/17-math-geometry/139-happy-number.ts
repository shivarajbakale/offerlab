/**
 * 202. Happy Number
 * Difficulty: Easy
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/happy-number/
 *
 * A happy number is defined by this process: starting with a positive
 * integer, replace it with the sum of the squares of its digits, and repeat.
 * If the process eventually reaches 1 the number is happy; otherwise it
 * loops forever in a cycle that does not include 1. Return true if `n` is
 * happy.
 *
 * Example 1:
 *   Input: n = 19
 *   Output: true   (1^2+9^2=82, 8^2+2^2=68, 6^2+8^2=100, 1^2+0^2+0^2=1)
 *
 * Example 2:
 *   Input: n = 2
 *   Output: false
 *
 * Constraints:
 *   1 <= n <= 2^31 - 1
 *
 * Approach: Floyd's cycle detection (fast & slow pointers)
 *   The sequence of digit-square sums always ends in a cycle (1 -> 1 is a
 *   cycle too). Advance `slow` one step and `fast` two steps until they meet;
 *   the number is happy iff the meeting point is 1.
 *
 * Time: O(log n)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

function sumOfSquares(n: number): number {
  let total = 0;
  while (n > 0) {
    const d = n % 10;
    total += d * d;
    n = Math.floor(n / 10);
  }
  return total;
}

export function isHappy(n: number): boolean {
  let slow = n;
  let fast = sumOfSquares(n);
  while (slow !== fast) {
    slow = sumOfSquares(slow);
    fast = sumOfSquares(sumOfSquares(fast));
  }
  return slow === 1;
}

test("202. Happy Number", () => {
  assert.equal(isHappy(19), true);
  assert.equal(isHappy(2), false);
  assert.equal(isHappy(1), true);
  assert.equal(isHappy(7), true);
  assert.equal(isHappy(2147483647), false);
});
