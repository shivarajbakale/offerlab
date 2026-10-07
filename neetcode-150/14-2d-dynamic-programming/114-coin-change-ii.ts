/**
 * 518. Coin Change II
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/coin-change-ii/
 *
 * Given coin denominations `coins` (unlimited supply of each) and an
 * `amount`, return the number of distinct combinations of coins that sum to
 * `amount`. Order doesn't matter (1+2 and 2+1 are the same). Return 0 if no
 * combination works.
 *
 * Example 1:
 *   Input: amount = 5, coins = [1, 2, 5]
 *   Output: 4   (5, 2+2+1, 2+1+1+1, 1+1+1+1+1)
 *
 * Example 2:
 *   Input: amount = 3, coins = [2]
 *   Output: 0
 *
 * Example 3:
 *   Input: amount = 10, coins = [10]
 *   Output: 1
 *
 * Constraints:
 *   1 <= coins.length <= 300
 *   1 <= coins[i] <= 5000, all distinct
 *   0 <= amount <= 5000
 *   The answer fits in a signed 32-bit integer.
 *
 * Approach: Unbounded knapsack, 1-D compressed
 *   State: dp[i][a] = ways to make amount a using coins[i..].
 *   Recurrence: dp[i][a] = dp[i + 1][a] (skip coin i)
 *                        + dp[i][a - coins[i]] (use coin i again).
 *   Base: dp[*][0] = 1.
 *   Compress to one row: process coins one at a time (outer loop) and sweep
 *   amounts upward so dp[a - c] already includes the current coin. Putting
 *   coins in the outer loop counts combinations, not permutations.
 *
 * Time: O(n * amount)   Space: O(amount)
 *
 * Pattern: knapsack
 * Key insight: Looping coins on the outside and amounts on the inside means each
 *   combination is built in one fixed coin order, so 1+2 and 2+1 are counted once.
 *   Sweeping amounts upward lets dp[a - c] already include coin c, which is what makes
 *   each coin reusable.
 * Real world: A vending machine or cash register counting how many ways it can make change
 *   from its denominations, e.g. to see if an odd amount can still be paid out when one
 *   coin type runs out.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[a] is the number of coin combinations making a, using only the coins seen so far
// @why Returns how many different coin combinations make `amount` (order doesn't matter).
// @goal how many different coin combinations from {JSON.stringify(coins)} add up to {amount}?
export function change(amount: number, coins: number[]): number {
  // @why `dp[a]` means the number of combinations making amount `a` using the coins processed so far.
  // @phase Setup: one count per amount from 0 to {amount}
  // @say Listing every combination explodes, and counting orderings would count 1+2 and 2+1 twice. Instead keep, for every amount up to {amount}, how many combinations reach it, and add coins one type at a time.
  const dp = new Array<number>(amount + 1).fill(0);
  // @why There is exactly one way to make 0: use no coins.
  // @say Amount 0 has exactly one combination, the empty one. Every other combination is built by adding a coin to a smaller one, so this 1 seeds all the counts.
  dp[0] = 1;
  // @why Coins are the outer loop so each combination is counted once, not once per order.
  // @phase Add one coin type at a time
  // @say Bring in coin {c}. Every count so far uses only earlier coins; now allow any number of {c}s too. Because each coin type is added once, a combination is built in one fixed order and never counted twice.
  for (const c of coins) {
    // @why Go upward so the same coin can be used again; `dp[a - c]` already includes this coin.
    // @yes Amount {a}: any combination for it that uses {c} is a combination for {a - c} plus one more {c}.
    // @no {c > amount ? "Coin " + c + " is bigger than " + amount + ", so it can't be part of any combination." : "Every amount up to " + amount + " now counts combinations that may use " + c + "."}
    for (let a = c; a <= amount; a++) {
      // @why Every combination for `a - c` plus coin `c` is a new combination for `a`.
      // @say Ways to make {a} with no {c}s at all: {dp[a]}. Ways that end with a {c}: as many as for {a - c}, {dp[a - c]}{a - c >= c ? " (already counting extra " + c + "s, since that cell was updated this round)" : ""}. Total {dp[a] + dp[a - c]}.
      dp[a] += dp[a - c]; // @ask dp[a]
    }
  }
  // @why The number of combinations for the target.
  // @phase Answer
  // @returns {dp[amount]}: {dp[amount] === 0 ? "no mix of these coins makes " + amount + ", so there is nothing to count." : (dp[amount] === 1 ? "the one combination" : "the combinations") + " of these coins that make " + amount + ", each counted once."}
  return dp[amount];
}

test("518. Coin Change II", () => {
  assert.equal(change(5, [1, 2, 5]), 4);
  assert.equal(change(3, [2]), 0);
  assert.equal(change(10, [10]), 1);
  assert.equal(change(0, [7]), 1);
});
