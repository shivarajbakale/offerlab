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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function minCostClimbingStairs(cost: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("746. Min Cost Climbing Stairs", () => {
  assert.equal(minCostClimbingStairs([10, 15, 20]), 15);
  assert.equal(minCostClimbingStairs([1, 100, 1, 1, 1, 100, 1, 1, 100, 1]), 6);
  assert.equal(minCostClimbingStairs([0, 0]), 0);
  assert.equal(minCostClimbingStairs([5, 3]), 3);
});
