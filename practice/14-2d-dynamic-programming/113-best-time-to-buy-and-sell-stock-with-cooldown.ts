/**
 * 309. Best Time to Buy and Sell Stock with Cooldown
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/
 *
 * `prices[i]` is a stock's price on day i. You may complete as many buy/sell
 * transactions as you like, but you can hold at most one share at a time,
 * and after selling you must wait one day (cooldown) before buying again.
 * Return the maximum profit.
 *
 * Example 1:
 *   Input: prices = [1, 2, 3, 0, 2]
 *   Output: 3   (buy, sell, cooldown, buy, sell)
 *
 * Example 2:
 *   Input: prices = [1]
 *   Output: 0
 *
 * Constraints:
 *   1 <= prices.length <= 5000
 *   0 <= prices[i] <= 1000
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxProfit(prices: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("309. Best Time to Buy and Sell Stock with Cooldown", () => {
  assert.equal(maxProfit([1, 2, 3, 0, 2]), 3);
  assert.equal(maxProfit([1]), 0);
  assert.equal(maxProfit([5, 4, 3, 2, 1]), 0);
  assert.equal(maxProfit([1, 2, 4]), 3);
});
