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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function change(amount: number, coins: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("518. Coin Change II", () => {
  assert.equal(change(5, [1, 2, 5]), 4);
  assert.equal(change(3, [2]), 0);
  assert.equal(change(10, [10]), 1);
  assert.equal(change(0, [7]), 1);
});
