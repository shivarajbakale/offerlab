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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findTargetSumWays(nums: number[], target: number): number {
  let dp = new Map<number, number>([[0, 1]]);
  for (const n of nums) {
    const next = new Map<number, number>();
    for (const [sum, count] of dp) {
      next.set(sum + n, (next.get(sum + n) ?? 0) + count);
      next.set(sum - n, (next.get(sum - n) ?? 0) + count);
    }
    dp = next;
  }
  return dp.get(target) ?? 0;
}

test("494. Target Sum", () => {
  assert.equal(findTargetSumWays([1, 1, 1, 1, 1], 3), 5);
  assert.equal(findTargetSumWays([1], 1), 1);
  assert.equal(findTargetSumWays([1], 2), 0);
  assert.equal(findTargetSumWays([0, 0, 1], 1), 4);
});
