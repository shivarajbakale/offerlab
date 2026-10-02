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
 *
 * Approach: Bottom-up DP over (day, buying?) states, O(1) space
 *   State: dp[i][buying] = max profit from day i onward, where `buying`
 *   says whether we're free to buy (true) or currently holding (false).
 *   Recurrence (with dp[i >= n] = 0):
 *     dp[i][buy]  = max(dp[i + 1][buy],  dp[i + 1][sell] - prices[i])
 *     dp[i][sell] = max(dp[i + 1][sell], dp[i + 2][buy]  + prices[i])
 *   Selling jumps to i + 2 to enforce the cooldown. Only days i + 1 and
 *   i + 2 are needed, so we keep a handful of variables.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: dp-state-machine
 * Key insight: Each day you are in one of two modes (free to buy, or holding), and selling
 *   moves you to day i + 2 instead of i + 1. Encoding the cooldown as that skip means the
 *   whole rule lives in the transition, so three rolling variables replace the table.
 * Real world: A trading bot with a mandatory settlement or wash-sale waiting period after
 *   each sale, planning entries and exits around the lockout.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxProfit(prices: number[]): number {
  let buy1 = 0; // dp[i + 1][buy]
  let sell1 = 0; // dp[i + 1][sell]
  let buy2 = 0; // dp[i + 2][buy]
  for (let i = prices.length - 1; i >= 0; i--) {
    const buy = Math.max(buy1, sell1 - prices[i]);
    const sell = Math.max(sell1, buy2 + prices[i]);
    buy2 = buy1;
    buy1 = buy;
    sell1 = sell;
  }
  return buy1;
}

test("309. Best Time to Buy and Sell Stock with Cooldown", () => {
  assert.equal(maxProfit([1, 2, 3, 0, 2]), 3);
  assert.equal(maxProfit([1]), 0);
  assert.equal(maxProfit([5, 4, 3, 2, 1]), 0);
  assert.equal(maxProfit([1, 2, 4]), 3);
});
