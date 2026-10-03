/**
 * 121. Best Time to Buy and Sell Stock
 * Difficulty: Easy
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/best-time-to-buy-and-sell-stock/
 *
 * Given an array `prices` where prices[i] is a stock's price on day i, choose
 * one day to buy and a later day to sell to maximize profit. Return the
 * maximum profit, or 0 if no profit is possible.
 *
 * Example 1:
 *   Input: prices = [7, 1, 5, 3, 6, 4]
 *   Output: 5   (buy at 1, sell at 6)
 *
 * Example 2:
 *   Input: prices = [7, 6, 4, 3, 1]
 *   Output: 0
 *
 * Constraints:
 *   1 <= prices.length <= 10^5
 *   0 <= prices[i] <= 10^4
 *
 * Approach: Sliding window / track minimum so far
 *   Keep the lowest buy price seen so far (left of the window). For each day,
 *   the best sale today is price - minSoFar; track the maximum of these.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: best-so-far
 * Key insight: The best sale on any day uses the cheapest price seen before it, so
 *   keeping one running minimum gives every day's best profit in O(1).
 * Real world: A trading dashboard showing the maximum drawup of a price series in a
 *   single streaming pass.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz hide:p
// @why Return the best profit from one buy followed by one later sell.
export function maxProfit(prices: number[]): number {
  // @why Cheapest price seen so far; the best day to have bought.
  let minPrice = Infinity;
  // @why Best profit so far; 0 means never trade.
  let best = 0;
  // @why Take each day in order, so a sell always comes after the buy.
  for (const p of prices) {
    // @why If today is cheaper than any earlier day, it becomes the buy day.
    minPrice = Math.min(minPrice, p); // @say Today's price {p}: is it the cheapest day to buy so far?
    // @why If we sold today, we'd earn `p - minPrice`; keep it if it beats the best.
    best = Math.max(best, p - minPrice); // @say Selling today earns {p - minPrice} over the cheapest buy; keep the max
  }
  // @why The top profit, or 0 if prices only fall.
  return best;
}

test("121. Best Time to Buy and Sell Stock", () => {
  assert.equal(maxProfit([7, 1, 5, 3, 6, 4]), 5);
  assert.equal(maxProfit([7, 6, 4, 3, 1]), 0);
  assert.equal(maxProfit([5]), 0);
  assert.equal(maxProfit([2, 4, 1, 7]), 6);
});
