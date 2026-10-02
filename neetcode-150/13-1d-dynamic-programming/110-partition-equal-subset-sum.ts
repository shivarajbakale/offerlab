/**
 * 416. Partition Equal Subset Sum
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/partition-equal-subset-sum/
 *
 * Given an array of positive integers `nums`, return true if it can be split
 * into two subsets whose sums are equal.
 *
 * Example 1:
 *   Input: nums = [1, 5, 11, 5]
 *   Output: true   ([1, 5, 5] and [11])
 *
 * Example 2:
 *   Input: nums = [1, 2, 3, 5]
 *   Output: false
 *
 * Constraints:
 *   1 <= nums.length <= 200
 *   1 <= nums[i] <= 100
 *
 * Approach: 0/1 knapsack over reachable sums
 *   If the total is odd, it's impossible. Otherwise we need a subset that
 *   sums to target = total / 2.
 *   State: dp[t] = true if some subset of the numbers seen so far sums to t.
 *   Recurrence: for each n, for t from target down to n:
 *     dp[t] = dp[t] || dp[t - n]
 *   (Iterating t downward ensures each number is used at most once.)
 *
 * Time: O(n * target)   Space: O(target)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canPartition(nums: number[]): boolean {
  const total = nums.reduce((a, b) => a + b, 0);
  if (total % 2 !== 0) return false;
  const target = total / 2;

  const dp = new Array<boolean>(target + 1).fill(false);
  dp[0] = true;
  for (const n of nums) {
    for (let t = target; t >= n; t--) {
      if (dp[t - n]) dp[t] = true;
    }
    if (dp[target]) return true;
  }
  return dp[target];
}

test("416. Partition Equal Subset Sum", () => {
  assert.equal(canPartition([1, 5, 11, 5]), true);
  assert.equal(canPartition([1, 2, 3, 5]), false);
  assert.equal(canPartition([1]), false);
  assert.equal(canPartition([2, 2]), true);
});
