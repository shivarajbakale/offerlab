/**
 * 875. Koko Eating Bananas
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/koko-eating-bananas/
 *
 * There are n piles of bananas, pile i holding piles[i] bananas. Koko picks an
 * eating speed k (bananas per hour). Each hour she chooses one pile and eats
 * k bananas from it; if the pile has fewer than k, she eats it all and waits
 * out the rest of that hour. Return the minimum integer k that lets her
 * finish all piles within h hours.
 *
 * Example 1:
 *   Input: piles = [3, 6, 7, 11], h = 8
 *   Output: 4
 *
 * Example 2:
 *   Input: piles = [30, 11, 23, 4, 20], h = 5
 *   Output: 30
 *
 * Example 3:
 *   Input: piles = [30, 11, 23, 4, 20], h = 6
 *   Output: 23
 *
 * Constraints:
 *   1 <= piles.length <= 10^4
 *   piles.length <= h <= 10^9
 *   1 <= piles[i] <= 10^9
 *
 * Approach: Binary search on the answer
 *   Speed k lies in [1, max(piles)]. Hours needed, sum(ceil(p / k)), is
 *   monotonically non-increasing in k, so binary search for the smallest k
 *   whose hours fit within h.
 *
 * Time: O(n log m), m = max(piles)   Space: O(1)
 *
 * Pattern: binary-search-on-answer
 * Key insight: Hours needed only go down as speed goes up, so "can she finish at speed
 *   k?" is a yes/no that flips once; binary search finds the smallest yes without trying
 *   every speed.
 * Real world: Capacity planning: finding the minimum throughput a worker pool needs to
 *   finish a batch of jobs before a deadline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz hide:p values:lo,hi,k range:lo..hi@k best:best
// @rule every speed below lo is too slow; every speed above hi finishes in time
// @why Finds the slowest eating speed that still finishes within `h` hours.
// @goal what is the slowest speed that finishes {JSON.stringify(piles)} within {h} hours?
export function minEatingSpeed(piles: number[], h: number): number {
  // @why The slowest possible speed is 1 banana per hour.
  // @phase Setup: every possible speed lies in one range
  // @say Trying speeds 1, 2, 3, … one by one could take up to {Math.max(...piles)} tries. But speed has a cut-off: once a speed is fast enough, every faster speed is too. So binary search for the cut-off between "too slow" and "fast enough".
  let lo = 1;
  // @why Eating the biggest pile in one hour is always fast enough, so this is the top of the range.
  // @say At speed {Math.max(...piles)} every pile takes one hour, {piles.length} hours total, and h ≥ number of piles, so this speed always works. Nothing faster is ever needed.
  let hi = Math.max(...piles);
  // @why Remember the slowest speed that worked; the top speed works for sure.
  let best = hi;
  // @why Binary search on the speed, since faster speeds only make it easier.
  // @phase Halve the range of speeds
  // @yes Speeds {lo}..{hi} are still undecided, so test the middle one.
  // @no Every speed has been sorted into "too slow" (below {lo}) or "fast enough", so {best} is the cut-off.
  while (lo <= hi) {
    // @why Try the middle speed.
    // @say Test speed {Math.floor((lo + hi) / 2)}, the middle of [{lo}, {hi}]. Its result settles half the remaining speeds at once.
    const k = Math.floor((lo + hi) / 2);
    // @why Count the total hours needed at this speed.
    let hours = 0;
    // @why Each pile takes whole hours, so round up.
    // @say Pile {p} takes ceil({p} / {k}) = {Math.ceil(p / k)} {Math.ceil(p / k) === 1 ? "hour" : "hours"}: Koko never switches piles mid-hour, so a partial hour counts as a whole one. Running total: {hours + Math.ceil(p / k)}.
    for (const p of piles) hours += Math.ceil(p / k);
    // @why Fast enough? Then this speed is a candidate.
    // @yes {hours} hours ≤ {h}: speed {k} is fast enough, and so is every speed above it.
    // @no {hours} hours > {h}: speed {k} is too slow, and so is every speed below it.
    if (hours <= h) { // @ask hours<=h
      // @why Keep this speed as the best so far.
      // @say {k} is the slowest working speed found so far{best !== k ? " (was " + best + ")" : ""}.
      best = k;
      // @why Try slower speeds to see if something smaller still works.
      // @say Everything above {k} is settled as "works". Look below it for an even slower speed.
      // @then Undecided speeds: {lo <= hi ? lo + ".." + hi : "none"}.
      hi = k - 1; // @ask hi
    } else {
      // @why Too slow, so only faster speeds can work.
      // @say Everything at or below {k} is too slow. Koko must eat faster.
      // @then Undecided speeds: {lo <= hi ? lo + ".." + hi : "none"}.
      lo = k + 1; // @ask lo
    }
  }
  // @why The slowest speed that worked.
  // @phase Answer
  // @returns {best}: the slowest speed that finishes in {h} hours, found in about log2(max pile) tests.
  return best;
}

test("875. Koko Eating Bananas", () => {
  assert.equal(minEatingSpeed([3, 6, 7, 11], 8), 4);
  assert.equal(minEatingSpeed([30, 11, 23, 4, 20], 5), 30);
  assert.equal(minEatingSpeed([30, 11, 23, 4, 20], 6), 23);
  assert.equal(minEatingSpeed([1000000000], 2), 500000000);
  assert.equal(minEatingSpeed([1, 1, 1], 10), 1);
});
