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
 *
 * Approach: Count map + smallest-first greedy
 *   The smallest remaining card must start a group (nothing smaller can
 *   precede it). Sort the distinct values; for each value with a remaining
 *   count c, it starts c groups, so consume c copies of each of the next
 *   groupSize - 1 consecutive values. If any is short, fail.
 *   (NeetCode uses a min-heap; iterating sorted distinct keys is equivalent.)
 *
 * Time: O(n log n)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isNStraightHand(hand: number[], groupSize: number): boolean {
  if (hand.length % groupSize !== 0) return false;

  const count = new Map<number, number>();
  for (const card of hand) count.set(card, (count.get(card) ?? 0) + 1);

  const keys = [...count.keys()].sort((a, b) => a - b);
  for (const start of keys) {
    const c = count.get(start) ?? 0;
    if (c === 0) continue;
    // `start` begins c groups: each needs start..start+groupSize-1.
    for (let v = start; v < start + groupSize; v++) {
      const have = count.get(v) ?? 0;
      if (have < c) return false;
      count.set(v, have - c);
    }
  }
  return true;
}

test("846. Hand of Straights", () => {
  assert.equal(isNStraightHand([1, 2, 3, 6, 2, 3, 4, 7, 8], 3), true);
  assert.equal(isNStraightHand([1, 2, 3, 4, 5], 4), false);
  assert.equal(isNStraightHand([5], 1), true); // groups of one
  assert.equal(isNStraightHand([1, 1, 2, 2, 3, 3], 3), true);
});
