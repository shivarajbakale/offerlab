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
// @goal what number comes after {n} in the sequence?
function sumOfSquares(n: number): number {
  // @why Running sum of the squared digits.
  // @say Peel {n}'s digits off one at a time from the right, squaring each into a running total.
  let total = 0;
  // @why Keep peeling off digits until the number is used up.
  // @yes Digits remain: {n}.
  // @no All digits used.
  while (n > 0) {
    // @why The last digit of `n`.
    // @say {n} % 10 = {n % 10}: the last digit, without turning the number into a string.
    const d = n % 10;
    // @why Square it and add it.
    // @say {d}² = {d * d}, running total {total + d * d}.
    total += d * d; // @ask total
    // @why Chop off the last digit.
    // @say Drop that digit: {n} becomes {Math.floor(n / 10)}.
    n = Math.floor(n / 10);
  }
  // @why The new number in the sequence.
  // @returns {total}, the next number in the sequence.
  return total;
}

// @why Returns true if repeating the digit-square step eventually reaches 1.
// @goal does repeatedly summing the squares of {n}'s digits ever reach 1?
export function isHappy(n: number): boolean {
  // @why `slow` and `fast` start on the sequence; fast moves two steps for each one of slow.
  // @phase Setup: two runners on the same sequence
  // @say Storing every number seen in a set catches a repeat, but uses memory that grows with the sequence. The numbers quickly drop below a few hundred and must eventually repeat, so the sequence ends in a loop. Two runners at different speeds detect that loop with O(1) memory, and 1 is just a loop of length one.
  let slow = n;
  // @why Fast is already one step ahead.
  // @then Slow is at {slow}, fast one step ahead at {fast}.
  let fast = sumOfSquares(n);
  // @why The sequence either hits 1 forever or loops. If it loops, fast catches slow, like cycle detection in a linked list.
  // @phase Race until they meet
  // @yes Slow at {slow}, fast at {fast}: not met yet. Inside a loop fast gains one step per round, so it can't jump over slow forever.
  // @no They met at {slow}: both runners are inside the loop the sequence ends in.
  while (slow !== fast) {
    // @why Slow moves one step.
    // @then Slow moved to {slow}.
    slow = sumOfSquares(slow);
    // @why Fast moves two steps.
    // @then Fast moved two steps to {fast}.
    fast = sumOfSquares(sumOfSquares(fast)); // @moment slow {slow}, fast jumps from {fast}
  }
  // @why If they met at 1, it is happy; if they met anywhere else, it is stuck in a loop.
  // @phase Answer
  // @returns {slow === 1 ? "true: they met at 1, and 1 maps to itself, so the sequence stays at 1." : "false: they met at " + slow + ", inside a loop that never contains 1."}
  return slow === 1;
}

test("202. Happy Number", () => {
  assert.equal(isHappy(19), true);
  assert.equal(isHappy(2), false);
  assert.equal(isHappy(1), true);
  assert.equal(isHappy(7), true);
  assert.equal(isHappy(2147483647), false);
});
