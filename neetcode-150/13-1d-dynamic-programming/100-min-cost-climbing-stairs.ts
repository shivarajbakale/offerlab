/**
 * 746. Min Cost Climbing Stairs
 * Difficulty: Easy
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/min-cost-climbing-stairs/
 *
 * You are given an integer array `cost` where cost[i] is the price of
 * stepping on stair i. After paying, you may climb one or two stairs. You can
 * start on stair 0 or stair 1. Return the minimum cost to reach the top
 * (the position just past the last stair).
 *
 * Example 1:
 *   Input: cost = [10, 15, 20]
 *   Output: 15   (start at index 1, pay 15, jump two to the top)
 *
 * Example 2:
 *   Input: cost = [1, 100, 1, 1, 1, 100, 1, 1, 100, 1]
 *   Output: 6
 *
 * Constraints:
 *   2 <= cost.length <= 1000
 *   0 <= cost[i] <= 999
 *
 * Approach: Bottom-up DP, in place
 *   State: dp[i] = minimum cost to reach the top starting from stair i.
 *   Recurrence: dp[i] = cost[i] + min(dp[i + 1], dp[i + 2]), with the top
 *   (index n) costing 0. Answer is min(dp[0], dp[1]).
 *   We walk right to left, reusing two variables for dp[i + 1] and dp[i + 2].
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: dp-1d
 * Key insight: The cheapest cost from stair i depends only on the cheapest costs from i +
 *   1 and i + 2, so walking right to left with two variables solves every stair once.
 *   Starting at stair 0 or 1 just means taking the min of the last two.
 * Real world: Choosing the cheapest sequence of short or long hops along a route, such as
 *   picking refuelling stops when each stop has a cost.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule next1 is the cheapest cost to finish from stair i + 1; next2, from stair i + 2
// @why Returns the cheapest total cost to get past the last stair, starting at stair 0 or 1.
export function minCostClimbingStairs(cost: number[]): number {
  // @why `next1` means the cheapest cost to finish when standing on stair `i + 1`; past the end costs 0.
  let next1 = 0; // dp[i + 1]
  // @why `next2` means the cheapest cost to finish from stair `i + 2`; also 0 beyond the top.
  let next2 = 0; // dp[i + 2]
  // @why Walk from the top down so the answers for later stairs are ready when we need them.
  for (let i = cost.length - 1; i >= 0; i--) {
    // @why Standing on `i` you pay `cost[i]`, then jump 1 or 2 stairs: take the cheaper way on.
    const cur = cost[i] + Math.min(next1, next2); // @ask cur
    // @why Slide the window down: the old `i + 1` becomes the new `i + 2`.
    next2 = next1;
    // @why The stair just solved becomes the new `i + 1` for the next round.
    next1 = cur;
  }
  // @why You may start on stair 0 or stair 1, so the answer is the cheaper of the two.
  return Math.min(next1, next2);
}

test("746. Min Cost Climbing Stairs", () => {
  assert.equal(minCostClimbingStairs([10, 15, 20]), 15);
  assert.equal(minCostClimbingStairs([1, 100, 1, 1, 1, 100, 1, 1, 100, 1]), 6);
  assert.equal(minCostClimbingStairs([0, 0]), 0);
  assert.equal(minCostClimbingStairs([5, 3]), 3);
});
