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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxProfit(prices: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("121. Best Time to Buy and Sell Stock", () => {
  assert.equal(maxProfit([7, 1, 5, 3, 6, 4]), 5);
  assert.equal(maxProfit([7, 6, 4, 3, 1]), 0);
  assert.equal(maxProfit([5]), 0);
  assert.equal(maxProfit([2, 4, 1, 7]), 6);
});
