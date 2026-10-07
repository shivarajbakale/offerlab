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
// @goal can the cards {JSON.stringify(hand)} be dealt into runs of {groupSize} consecutive values?
export function isNStraightHand(hand: number[], groupSize: number): boolean {
  // @why If the cards cannot be split into equal groups, it is impossible right away.
  // @phase Setup: rule out a bad count, then tally every value
  // @yes {hand.length} cards can't split into groups of exactly {groupSize}: {hand.length} ÷ {groupSize} leaves {hand.length % groupSize} over.
  // @no {hand.length} cards make exactly {hand.length / groupSize} {hand.length / groupSize === 1 ? "group" : "groups"} of {groupSize}, so the count alone doesn't rule it out.
  // @returns false: some cards would be left without a full group, whatever the values.
  if (hand.length % groupSize !== 0) return false;

  // @why `count` tracks how many copies of each card value are still unused.
  // @say Trying every way to deal the cards into groups explodes. But the smallest card left can only ever be the bottom of a run, since nothing below it is left to sit under it. So a count per value lets you deal runs greedily from the bottom up.
  const count = new Map<number, number>();
  // @why Count every card in the hand.
  // @then Copies counted so far (value×copies): {[...count].map((e) => e[0] + "×" + e[1]).join(", ")}.
  for (const card of hand) count.set(card, (count.get(card) ?? 0) + 1);

  // @why Sort the distinct values so we always handle the smallest card first.
  // @say Visit distinct values from smallest up: {JSON.stringify([...count.keys()].sort((a, b) => a - b))}.
  const keys = [...count.keys()].sort((a, b) => a - b);
  // @why The smallest remaining card must start a group, so go from low to high.
  // @phase Smallest value first: it must start runs
  // @say Value {start}. Everything below it is already used up, so any copies of {start} still left can only start a run.
  for (const start of keys) {
    // @why How many copies of `start` are still unused.
    // @say {count.get(start) ?? 0} {(count.get(start) ?? 0) === 1 ? "copy" : "copies"} of {start} left unused.
    const c = count.get(start) ?? 0; // @ask c
    // @why If they were all used by earlier groups, nothing to start here.
    // @yes Every {start} was already used inside runs started lower down, so no run starts here.
    // @no {c} {c === 1 ? "copy" : "copies"} of {start} left, and nothing smaller can absorb {c === 1 ? "it" : "them"}, so {start} must start {c} {c === 1 ? "run" : "runs"}: {start}..{start + groupSize - 1}.
    if (c === 0) continue;
    // `start` begins c groups: each needs start..start+groupSize-1.
    // @why Build `c` groups, each needing one card of every value from `start` up.
    // @yes {c === 1 ? "The run" : "Each of the " + c + " runs"} from {start} needs a card of value {v}{v === start ? " to begin" : " next"}.
    // @no {c === 1 ? "The run" : "All " + c + " runs"} {start}..{start + groupSize - 1} {c === 1 ? "is" : "are"} complete.
    for (let v = start; v < start + groupSize; v++) {
      // @why How many copies of this value we still have.
      // @say {count.get(v) ?? 0} {(count.get(v) ?? 0) === 1 ? "copy" : "copies"} of {v} left.
      const have = count.get(v) ?? 0;
      // @why Not enough copies to give every group one, so the hand cannot work.
      // @yes Only {have} {have === 1 ? "copy" : "copies"} of {v} for {c} {c === 1 ? "run" : "runs"} that must contain it. Those runs can't be finished, and they had no other choice of start.
      // @no {have} {have === 1 ? "copy" : "copies"} of {v} {have === 1 ? "covers" : "cover"} {c === 1 ? "the run" : "all " + c + " runs"}.
      // @returns false: a run that was forced to start at {start} has no card of value {v} to continue with.
      if (have < c) return false;
      // @why Use up `c` copies of this value.
      // @say Hand one {v} to {c === 1 ? "the run" : "each of the " + c + " runs"}: {have} − {c} = {have - c} left.
      count.set(v, have - c); // @ask count.get(v)
    }
  }
  // @why Every card ended up in a valid group.
  // @phase Answer
  // @returns true: every value was either used up by lower runs or started its own, and no run came up short. Sorting dominates: O(n log n).
  return true;
}

test("846. Hand of Straights", () => {
  assert.equal(isNStraightHand([1, 2, 3, 6, 2, 3, 4, 7, 8], 3), true);
  assert.equal(isNStraightHand([1, 2, 3, 4, 5], 4), false);
  assert.equal(isNStraightHand([5], 1), true); // groups of one
  assert.equal(isNStraightHand([1, 1, 2, 2, 3, 3], 3), true);
});
