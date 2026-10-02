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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function change(amount: number, coins: number[]): number {
  const dp = new Array<number>(amount + 1).fill(0);
  dp[0] = 1;
  for (const c of coins) {
    for (let a = c; a <= amount; a++) {
      dp[a] += dp[a - c];
    }
  }
  return dp[amount];
}

test("518. Coin Change II", () => {
  assert.equal(change(5, [1, 2, 5]), 4);
  assert.equal(change(3, [2]), 0);
  assert.equal(change(10, [10]), 1);
  assert.equal(change(0, [7]), 1);
});
