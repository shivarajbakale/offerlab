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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isHappy(n: number): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("202. Happy Number", () => {
  assert.equal(isHappy(19), true);
  assert.equal(isHappy(2), false);
  assert.equal(isHappy(1), true);
  assert.equal(isHappy(7), true);
  assert.equal(isHappy(2147483647), false);
});
