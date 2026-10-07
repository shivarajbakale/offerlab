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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function minEatingSpeed(piles: number[], h: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("875. Koko Eating Bananas", () => {
  assert.equal(minEatingSpeed([3, 6, 7, 11], 8), 4);
  assert.equal(minEatingSpeed([30, 11, 23, 4, 20], 5), 30);
  assert.equal(minEatingSpeed([30, 11, 23, 4, 20], 6), 23);
  assert.equal(minEatingSpeed([1000000000], 2), 500000000);
  assert.equal(minEatingSpeed([1, 1, 1], 10), 1);
});
