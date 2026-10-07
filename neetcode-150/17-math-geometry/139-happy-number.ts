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
 *
 * Pattern: fast-slow-pointers,math
 * Key insight: Repeated digit-square sums always fall into a cycle, and reaching 1 is just
 *   a cycle of length one. Floyd's slow/fast pointers find the cycle without storing seen
 *   values; the number is happy iff they meet at 1.
 * Real world: Detecting that an iterated function such as a pseudo-random generator or a
 *   redirect chain has entered a loop, using constant memory.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule fast takes two steps per slow step, so in any cycle they meet; happy iff they meet at 1
// @why Replaces a number with the sum of the squares of its digits.
function sumOfSquares(n: number): number {
  // @why Running sum of the squared digits.
  let total = 0;
  // @why Keep peeling off digits until the number is used up.
  while (n > 0) {
    // @why The last digit of `n`.
    const d = n % 10;
    // @why Square it and add it.
    total += d * d; // @ask total
    // @why Chop off the last digit.
    n = Math.floor(n / 10);
  }
  // @why The new number in the sequence.
  return total;
}

// @why Returns true if repeating the digit-square step eventually reaches 1.
export function isHappy(n: number): boolean {
  // @why `slow` and `fast` start on the sequence; fast moves two steps for each one of slow.
  let slow = n;
  // @why Fast is already one step ahead.
  let fast = sumOfSquares(n);
  // @why The sequence either hits 1 forever or loops. If it loops, fast catches slow, like cycle detection in a linked list.
  while (slow !== fast) {
    // @why Slow moves one step.
    slow = sumOfSquares(slow);
    // @why Fast moves two steps.
    fast = sumOfSquares(sumOfSquares(fast)); // @moment slow {slow}, fast jumps from {fast}
  }
  // @why If they met at 1, it is happy; if they met anywhere else, it is stuck in a loop.
  return slow === 1;
}

test("202. Happy Number", () => {
  assert.equal(isHappy(19), true);
  assert.equal(isHappy(2), false);
  assert.equal(isHappy(1), true);
  assert.equal(isHappy(7), true);
  assert.equal(isHappy(2147483647), false);
});
