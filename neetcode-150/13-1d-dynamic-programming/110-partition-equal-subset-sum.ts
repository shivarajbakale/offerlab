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
 *
 * Pattern: knapsack
 * Key insight: Two equal halves exist exactly when some subset sums to total / 2, so it
 *   becomes a reachable-sum question. Updating sums from high to low means each number is
 *   used at most once in a pass.
 * Real world: Splitting jobs or files across two machines or disks so both get the same
 *   total load.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[t] is true when some subset of the numbers seen so far sums to exactly t
// @why Returns whether the numbers can be split into two groups with equal sums.
export function canPartition(nums: number[]): boolean {
  // @why Sum of all numbers; needed to know what each half must be.
  const total = nums.reduce((a, b) => a + b, 0);
  // @why An odd total can't be cut into two equal whole halves.
  if (total % 2 !== 0) return false;
  // @why One group must add up to half the total; the other then does too.
  const target = total / 2;

  // @why `dp[t]` means some subset of the numbers seen so far adds up to exactly `t`.
  const dp = new Array<boolean>(target + 1).fill(false);
  // @why Taking nothing gives sum 0, the base case.
  dp[0] = true;
  // @why Consider each number once: take it or leave it.
  for (const n of nums) {
    // @why Go downward so this number isn't used twice in the same round.
    for (let t = target; t >= n; t--) {
      // @why If `t - n` was reachable, adding `n` makes `t` reachable.
      if (dp[t - n]) dp[t] = true; // @ask dp[t]
    }
    // @why Stop early once the half-sum is reachable.
    if (dp[target]) return true;
  }
  // @why Whether the half-sum can be reached by some subset.
  return dp[target];
}

test("416. Partition Equal Subset Sum", () => {
  assert.equal(canPartition([1, 5, 11, 5]), true);
  assert.equal(canPartition([1, 2, 3, 5]), false);
  assert.equal(canPartition([1]), false);
  assert.equal(canPartition([2, 2]), true);
});
