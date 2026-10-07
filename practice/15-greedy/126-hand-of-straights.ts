/**
 * 846. Hand of Straights
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/hand-of-straights/
 *
 * Alice has a hand of cards, given as an integer array `hand`. She wants to
 * rearrange them into groups of exactly `groupSize` cards, where each group
 * consists of consecutive values. Return true if this is possible.
 *
 * Example 1:
 *   Input: hand = [1, 2, 3, 6, 2, 3, 4, 7, 8], groupSize = 3
 *   Output: true   ([1,2,3], [2,3,4], [6,7,8])
 *
 * Example 2:
 *   Input: hand = [1, 2, 3, 4, 5], groupSize = 4
 *   Output: false
 *
 * Constraints:
 *   1 <= hand.length <= 10^4
 *   0 <= hand[i] <= 10^9
 *   1 <= groupSize <= hand.length
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isNStraightHand(hand: number[], groupSize: number): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("846. Hand of Straights", () => {
  assert.equal(isNStraightHand([1, 2, 3, 6, 2, 3, 4, 7, 8], 3), true);
  assert.equal(isNStraightHand([1, 2, 3, 4, 5], 4), false);
  assert.equal(isNStraightHand([5], 1), true); // groups of one
  assert.equal(isNStraightHand([1, 1, 2, 2, 3, 3], 3), true);
});
