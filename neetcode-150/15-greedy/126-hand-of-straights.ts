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
 *
 * Pattern: greedy
 * Key insight: The smallest card left cannot be anything but the start of a group, so it
 *   forces its whole run. If it has count c, it starts c groups at once, so subtract c
 *   from each of the next groupSize values in one step.
 * Real world: A scheduler packing tasks into fixed-length batches of consecutive time
 *   slots, failing fast when the earliest pending slot cannot start a full batch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule the smallest card left must start a group; cards below start are all used
// @why Returns true if the cards can be split into groups of `groupSize` consecutive numbers.
export function isNStraightHand(hand: number[], groupSize: number): boolean {
  // @why If the cards cannot be split into equal groups, it is impossible right away.
  if (hand.length % groupSize !== 0) return false;

  // @why `count` tracks how many copies of each card value are still unused.
  const count = new Map<number, number>();
  // @why Count every card in the hand.
  for (const card of hand) count.set(card, (count.get(card) ?? 0) + 1);

  // @why Sort the distinct values so we always handle the smallest card first.
  const keys = [...count.keys()].sort((a, b) => a - b);
  // @why The smallest remaining card must start a group, so go from low to high.
  for (const start of keys) {
    // @why How many copies of `start` are still unused.
    const c = count.get(start) ?? 0; // @ask c
    // @why If they were all used by earlier groups, nothing to start here.
    if (c === 0) continue;
    // `start` begins c groups: each needs start..start+groupSize-1.
    // @why Build `c` groups, each needing one card of every value from `start` up.
    for (let v = start; v < start + groupSize; v++) {
      // @why How many copies of this value we still have.
      const have = count.get(v) ?? 0;
      // @why Not enough copies to give every group one, so the hand cannot work.
      if (have < c) return false;
      // @why Use up `c` copies of this value.
      count.set(v, have - c); // @ask count.get(v)
    }
  }
  // @why Every card ended up in a valid group.
  return true;
}

test("846. Hand of Straights", () => {
  assert.equal(isNStraightHand([1, 2, 3, 6, 2, 3, 4, 7, 8], 3), true);
  assert.equal(isNStraightHand([1, 2, 3, 4, 5], 4), false);
  assert.equal(isNStraightHand([5], 1), true); // groups of one
  assert.equal(isNStraightHand([1, 1, 2, 2, 3, 3], 3), true);
});
