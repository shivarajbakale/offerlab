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

// @rule buy1 / sell1 are the best profit from day i+1 on when free to buy / holding a stock
// @why Returns the max profit with unlimited trades, but a one-day cooldown after each sell.
// @goal what is the most profit from prices {JSON.stringify(prices)} with a one-day cooldown after each sale?
export function maxProfit(prices: number[]): number {
  // @why `buy1` means the best future profit from day `i + 1` on when you are free to buy.
  // @phase Setup: past the last day, nothing more can be earned
  // @say Trying every buy/sell/wait pattern is 3^n. But what you can still earn from a day on depends only on the day and whether you hold a share, so two numbers per day are enough, and each day only looks one or two days ahead.
  let buy1 = 0; // dp[i + 1][buy]
  // @why `sell1` means the best future profit from day `i + 1` on when you hold a stock and may sell.
  let sell1 = 0; // dp[i + 1][sell]
  // @why `buy2` means the best profit from day `i + 2` on when free to buy; selling jumps here for the cooldown.
  let buy2 = 0; // dp[i + 2][buy]
  // @why Go backwards so the future days are solved first.
  // @phase Walk back from the last day: decide each day in both modes
  // @yes Day {i}, price {prices[i]}. Every later day is already solved, so today's best choice can be read off them.
  // @no Every day is decided, back to day 0.
  for (let i = prices.length - 1; i >= 0; i--) {
    // @why When free to buy: wait (`buy1`) or buy today, paying the price and moving to the holding state.
    // @say Free to buy on day {i}: wait and keep {buy1}, or buy at {prices[i]} and then earn {sell1} while holding, {sell1} - {prices[i]} = {sell1 - prices[i]}. {sell1 - prices[i] > buy1 ? "Buying wins." : "Waiting is at least as good."}
    const buy = Math.max(buy1, sell1 - prices[i]); // @ask buy
    // @why When holding: wait (`sell1`) or sell today for the price, then skip a day (cooldown) to `buy2`.
    // @say Holding on day {i}: keep holding for {sell1}, or sell for {prices[i]} and, after the forced rest day, {i + 2 >= prices.length ? "earn nothing more (day " + (i + 2) + " is past the end)" : "earn " + buy2 + " from day " + (i + 2)}: {prices[i]} + {buy2} = {prices[i] + buy2}. {prices[i] + buy2 > sell1 ? "Selling wins." : "Holding is at least as good."}
    const sell = Math.max(sell1, buy2 + prices[i]); // @ask sell
    // @why Slide the window: today's `i + 1` becomes the next round's `i + 2`.
    // @say Step one day back: the day after tomorrow becomes what was tomorrow, so the old {buy1} is now the post-cooldown value.
    buy2 = buy1;
    // @why Save today's free-to-buy value.
    buy1 = buy;
    // @why Save today's holding value.
    // @then From day {i} on: {buy1} if free to buy, {sell1} if holding.
    sell1 = sell;
  }
  // @why You start with no stock and free to buy, on day 0.
  // @phase Answer
  // @returns {buy1}: the best profit from day 0 starting with no share, in one backward pass.
  return buy1;
}

test("309. Best Time to Buy and Sell Stock with Cooldown", () => {
  assert.equal(maxProfit([1, 2, 3, 0, 2]), 3);
  assert.equal(maxProfit([1]), 0);
  assert.equal(maxProfit([5, 4, 3, 2, 1]), 0);
  assert.equal(maxProfit([1, 2, 4]), 3);
});
