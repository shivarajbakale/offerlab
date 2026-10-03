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

// @viz hide:p values:lo,hi,k
// @why Finds the slowest eating speed that still finishes within `h` hours.
export function minEatingSpeed(piles: number[], h: number): number {
  // @why The slowest possible speed is 1 banana per hour.
  let lo = 1;
  // @why Eating the biggest pile in one hour is always fast enough, so this is the top of the range.
  let hi = Math.max(...piles);
  // @why Remember the slowest speed that worked; the top speed works for sure.
  let best = hi;
  // @why Binary search on the speed, since faster speeds only make it easier.
  while (lo <= hi) {
    // @why Try the middle speed.
    const k = Math.floor((lo + hi) / 2); // @say Binary search on the speed: try the middle of [{lo}, {hi}]
    // @why Count the total hours needed at this speed.
    let hours = 0;
    // @why Each pile takes whole hours, so round up.
    for (const p of piles) hours += Math.ceil(p / k); // @say Each pile takes ceil(pile / {k}) hours at this speed
    // @why Fast enough? Then this speed is a candidate.
    if (hours <= h) { // @say Can Koko finish in {h} hours eating {k} per hour?
      // @why Keep this speed as the best so far.
      best = k;
      // @why Try slower speeds to see if something smaller still works.
      hi = k - 1; // @say {k} works; look for an even slower speed
    } else {
      // @why Too slow, so only faster speeds can work.
      lo = k + 1; // @say {k} is too slow, so she must eat faster
    }
  }
  // @why The slowest speed that worked.
  return best;
}

test("875. Koko Eating Bananas", () => {
  assert.equal(minEatingSpeed([3, 6, 7, 11], 8), 4);
  assert.equal(minEatingSpeed([30, 11, 23, 4, 20], 5), 30);
  assert.equal(minEatingSpeed([30, 11, 23, 4, 20], 6), 23);
  assert.equal(minEatingSpeed([1000000000], 2), 500000000);
  assert.equal(minEatingSpeed([1, 1, 1], 10), 1);
});
