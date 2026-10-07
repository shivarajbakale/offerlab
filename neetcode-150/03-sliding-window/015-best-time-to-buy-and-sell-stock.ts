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

// @viz hide:p best:best
// @rule minPrice is the cheapest price on any day up to today
// @why Return the best profit from one buy followed by one later sell.
// @goal what is the most you can make buying once and selling later, with prices {JSON.stringify(prices)}?
export function maxProfit(prices: number[]): number {
  // @why Cheapest price seen so far; the best day to have bought.
  // @phase Setup: remember the cheapest buy so far
  // @say Trying every buy day with every later sell day is n² work. But for any sell day, the best buy is simply the cheapest day before it, so one running minimum replaces the inner loop.
  let minPrice = Infinity;
  // @why Best profit so far; 0 means never trade.
  let best = 0;
  // @why Take each day in order, so a sell always comes after the buy.
  // @phase Each day: could it be the buy day, or the sell day?
  // @say Day with price {p}. Cheapest buy so far: {minPrice === Infinity ? "none yet" : minPrice}. Best profit so far: {best}.
  for (const p of prices) {
    // @why If today is cheaper than any earlier day, it becomes the buy day.
    // @say {minPrice === Infinity ? p + " is the first price, so it is the cheapest buy so far." : p < minPrice ? p + " is cheaper than the old low " + minPrice + ", so it becomes the buy day for every later sale." : p + " is not cheaper than " + minPrice + ", so the best buy day stays."}
    minPrice = Math.min(minPrice, p); // @ask minPrice
    // @why If we sold today, we'd earn `p - minPrice`; keep it if it beats the best.
    // @say Sell today: {p} − {minPrice} = {p - minPrice}. Best so far was {best}. {p - minPrice > best ? "New best." : "Not better, so best stays."}
    // @then Best profit from any buy-then-sell up to today: {best}.
    best = Math.max(best, p - minPrice); // @ask best
  }
  // @why The top profit, or 0 if prices only fall.
  // @phase Answer
  // @returns {best === 0 ? "0: prices never rose after a low, so the best move is not to trade." : best + ": every sell day was paired with the cheapest day before it, in one pass."}
  return best;
}

test("121. Best Time to Buy and Sell Stock", () => {
  assert.equal(maxProfit([7, 1, 5, 3, 6, 4]), 5);
  assert.equal(maxProfit([7, 6, 4, 3, 1]), 0);
  assert.equal(maxProfit([5]), 0);
  assert.equal(maxProfit([2, 4, 1, 7]), 6);
});
