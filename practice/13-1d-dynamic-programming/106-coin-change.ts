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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function coinChange(coins: number[], amount: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("322. Coin Change", () => {
  assert.equal(coinChange([1, 2, 5], 11), 3);
  assert.equal(coinChange([2], 3), -1);
  assert.equal(coinChange([1], 0), 0);
  assert.equal(coinChange([186, 419, 83, 408], 6249), 20);
});
