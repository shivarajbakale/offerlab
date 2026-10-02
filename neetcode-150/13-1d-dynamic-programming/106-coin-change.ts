/**
 * 322. Coin Change
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/coin-change/
 *
 * Given coin denominations `coins` (unlimited supply of each) and a target
 * `amount`, return the fewest coins that add up to `amount`, or -1 if it
 * cannot be made.
 *
 * Example 1:
 *   Input: coins = [1, 2, 5], amount = 11
 *   Output: 3   (5 + 5 + 1)
 *
 * Example 2:
 *   Input: coins = [2], amount = 3
 *   Output: -1
 *
 * Example 3:
 *   Input: coins = [1], amount = 0
 *   Output: 0
 *
 * Constraints:
 *   1 <= coins.length <= 12
 *   1 <= coins[i] <= 2^31 - 1
 *   0 <= amount <= 10^4
 *
 * Approach: Bottom-up DP (unbounded knapsack)
 *   State: dp[a] = fewest coins to make amount a.
 *   Recurrence: dp[0] = 0; dp[a] = 1 + min(dp[a - c]) over coins c <= a.
 *   Unreachable amounts stay at the sentinel amount + 1.
 *
 * Time: O(amount * coins)   Space: O(amount)
 *
 * Pattern: knapsack, dp-1d
 * Key insight: Whatever coin is used last, the rest must be an optimal way to make a - c,
 *   so dp[a] = 1 + min(dp[a - c]). Greedy fails for coins like [1, 3, 4], while the table
 *   tries every last coin.
 * Real world: Vending machines and cash registers giving change with the fewest coins or
 *   notes when the denominations are not greedy-safe.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function coinChange(coins: number[], amount: number): number {
  const dp = new Array<number>(amount + 1).fill(amount + 1);
  dp[0] = 0; // @say Base case: amount 0 needs zero coins
  for (let a = 1; a <= amount; a++) { // @say Build answers bottom-up, smallest amount first
    for (const c of coins) {
      if (c <= a) { // @say Coin {c} is only usable if it fits inside amount {a}
        dp[a] = Math.min(dp[a], dp[a - c] + 1); // @say Use coin {c} last: 1 + best for {a - c}; keep if it beats {dp[a]}
      }
    }
  }
  return dp[amount] > amount ? -1 : dp[amount];
}

test("322. Coin Change", () => {
  assert.equal(coinChange([1, 2, 5], 11), 3);
  assert.equal(coinChange([2], 3), -1);
  assert.equal(coinChange([1], 0), 0);
  assert.equal(coinChange([186, 419, 83, 408], 6249), 20);
});
