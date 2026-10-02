/**
 * 312. Burst Balloons
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/burst-balloons/
 *
 * There are n balloons, each painted with a number `nums[i]`. Bursting
 * balloon i earns nums[i - 1] * nums[i] * nums[i + 1] coins, where the
 * neighbours are whichever balloons are currently adjacent to it; an
 * out-of-range neighbour counts as 1. After a burst, its neighbours become
 * adjacent. Return the maximum coins you can collect by bursting them all.
 *
 * Example 1:
 *   Input: nums = [3, 1, 5, 8]
 *   Output: 167
 *   (3*1*5 + 3*5*8 + 1*3*8 + 1*8*1 = 15 + 120 + 24 + 8)
 *
 * Example 2:
 *   Input: nums = [1, 5]
 *   Output: 10
 *
 * Constraints:
 *   1 <= nums.length <= 300
 *   0 <= nums[i] <= 100
 *
 * Approach: Interval DP, choosing the LAST balloon to burst
 *   Pad nums with 1 on both ends. Instead of the first balloon to burst in
 *   an interval, pick the last one: when it pops, its neighbours are the
 *   interval's fixed outer boundaries, which makes subproblems independent.
 *   State: dp[l][r] = max coins from bursting every balloon in (l, r)
 *   exclusive, with l and r still standing.
 *   Recurrence: dp[l][r] = max over l < k < r of
 *     dp[l][k] + a[l] * a[k] * a[r] + dp[k][r]
 *   Fill by increasing interval length. Answer: dp[0][n + 1].
 *
 * Time: O(n^3)   Space: O(n^2)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxCoins(nums: number[]): number {
  const a = [1, ...nums, 1];
  const size = a.length;
  const dp = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  for (let len = 2; len < size; len++) {
    for (let l = 0; l + len < size; l++) {
      const r = l + len;
      for (let k = l + 1; k < r; k++) {
        dp[l][r] = Math.max(dp[l][r], dp[l][k] + a[l] * a[k] * a[r] + dp[k][r]);
      }
    }
  }
  return dp[0][size - 1];
}

test("312. Burst Balloons", () => {
  assert.equal(maxCoins([3, 1, 5, 8]), 167);
  assert.equal(maxCoins([1, 5]), 10);
  assert.equal(maxCoins([7]), 7);
  assert.equal(maxCoins([0, 0]), 0);
});
