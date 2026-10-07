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

// @rule dp[a] is the fewest coins that make amount a, using any of the coins
// @why Returns the fewest coins that add up to `amount`, or -1 if impossible.
// @goal what is the fewest coins from {JSON.stringify(coins)} that add up to exactly {amount}?
export function coinChange(coins: number[], amount: number): number {
  // @why `dp[a]` means the fewest coins to make amount `a`; start at `amount + 1`, which stands for impossible.
  // @phase Setup: one answer slot per amount from 0 to {amount}
  // @say Greedy (biggest coin first) can fail, e.g. coins [1, 3, 4] for 6 gives 4+1+1 instead of 3+3, and trying every combination is exponential. But the best way to make any amount ends with some coin c, after the best way to make (amount − c). So solve every smaller amount once, smallest first. {amount + 1} means "impossible": no real answer can use more than {amount} coins.
  const dp = new Array<number>(amount + 1).fill(amount + 1);
  // @why Making amount 0 takes no coins; every other amount builds on this.
  // @say Base case: amount 0 needs zero coins. Every real answer ends by reaching 0.
  dp[0] = 0;
  // @why Each amount `a` depends on smaller amounts, so go upward from 1.
  // @phase Build answers bottom-up, smallest amount first
  // @yes Amount {a} is next. Every smaller amount already has its final answer, so any "last coin" choice can be priced right away.
  // @no Every amount up to {amount} is solved.
  for (let a = 1; a <= amount; a++) {
    // @why Try each coin as the last coin used for amount `a`.
    // @say For amount {a}, try coin {c} as the last coin.
    for (const c of coins) {
      // @why A coin bigger than `a` can't be used.
      // @yes Coin {c} fits inside {a}, leaving {a - c} to make some other way.
      // @no Coin {c} is bigger than {a}, so it can't be the last coin: it would overshoot.
      if (c <= a) {
        // @why Using coin `c` last costs 1 plus the best for `a - c`; keep it if it beats the current best.
        // @say Coin {c} last: 1 + best for {a - c} ({dp[a - c] > amount ? "impossible" : dp[a - c]}) = {dp[a - c] > amount ? "impossible" : dp[a - c] + 1}. Best for {a} so far: {dp[a] > amount ? "none yet" : dp[a]}. {dp[a - c] + 1 < dp[a] ? "Coin " + c + " wins." : "Keep the old best."}
        // @then Best for {a} so far: {dp[a] > amount ? "impossible" : dp[a] + (dp[a] === 1 ? " coin" : " coins")}.
        dp[a] = Math.min(dp[a], dp[a - c] + 1); // @ask dp[a]
      }
    }
  }
  // @why If it is still the impossible marker, no combination works, so return -1.
  // @phase Answer
  // @returns {dp[amount] > amount ? "-1: no mix of these coins reaches " + amount + ", since its slot never dropped below the impossible marker" : dp[amount] + ": the fewest coins for " + amount + ", after trying every coin as the last one at every amount, O(amount × coins) time"}.
  return dp[amount] > amount ? -1 : dp[amount];
}

test("322. Coin Change", () => {
  assert.equal(coinChange([1, 2, 5], 11), 3);
  assert.equal(coinChange([2], 3), -1);
  assert.equal(coinChange([1], 0), 0);
  assert.equal(coinChange([186, 419, 83, 408], 6249), 20);
});
