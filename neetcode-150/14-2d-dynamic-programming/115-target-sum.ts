/**
 * 494. Target Sum
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/target-sum/
 *
 * Given an integer array `nums` and an integer `target`, place a '+' or '-'
 * in front of every number and concatenate them into an expression. Return
 * how many different sign assignments make the expression equal `target`.
 *
 * Example 1:
 *   Input: nums = [1, 1, 1, 1, 1], target = 3
 *   Output: 5
 *
 * Example 2:
 *   Input: nums = [1], target = 1
 *   Output: 1
 *
 * Constraints:
 *   1 <= nums.length <= 20
 *   0 <= nums[i] <= 1000
 *   0 <= sum(nums[i]) <= 1000
 *   -1000 <= target <= 1000
 *
 * Approach: Bottom-up DP over reachable sums
 *   State: dp[i] maps sum -> number of ways to reach that sum using the
 *   first i numbers.
 *   Recurrence: for each sum s with count k in dp[i],
 *     dp[i + 1][s + nums[i]] += k
 *     dp[i + 1][s - nums[i]] += k
 *   Base: dp[0] = { 0: 1 }. Answer: dp[n][target] (or 0).
 *   Only the previous layer is kept.
 *
 * Time: O(n * S)   Space: O(S)   (S = sum(nums))
 *
 * Pattern: knapsack
 * Key insight: Only the running sum matters, not which signs produced it, so many sign
 *   choices merge into one state. A map of sum -> count per layer replaces the 2^n
 *   enumeration with at most 2 * sum(nums) + 1 states.
 * Real world: A budgeting tool counting how many ways to mark line items as credit or
 *   debit so a ledger nets out to a given balance, used to spot ambiguous reconciliations.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns how many ways to put + or - before each number so the total equals `target`.
export function findTargetSumWays(nums: number[], target: number): number {
  // @why `dp` maps a running sum to how many sign choices so far reach it; before any number, sum 0 has 1 way.
  let dp = new Map<number, number>([[0, 1]]);
  // @why Each number must get a sign, so process them one by one.
  for (const n of nums) {
    // @why Fresh map for the sums after this number, so old sums are not mixed in.
    const next = new Map<number, number>();
    // @why Take every sum reached so far and extend it.
    for (const [sum, count] of dp) {
      // @why Choosing + moves the sum to `sum + n`, carrying over all `count` ways.
      next.set(sum + n, (next.get(sum + n) ?? 0) + count);
      // @why Choosing - moves the sum to `sum - n`, carrying over all `count` ways.
      next.set(sum - n, (next.get(sum - n) ?? 0) + count);
    }
    // @why The new map becomes the state for the next number.
    dp = next;
  }
  // @why How many sign choices end at `target` (0 if none).
  return dp.get(target) ?? 0;
}

test("494. Target Sum", () => {
  assert.equal(findTargetSumWays([1, 1, 1, 1, 1], 3), 5);
  assert.equal(findTargetSumWays([1], 1), 1);
  assert.equal(findTargetSumWays([1], 2), 0);
  assert.equal(findTargetSumWays([0, 0, 1], 1), 4);
});
