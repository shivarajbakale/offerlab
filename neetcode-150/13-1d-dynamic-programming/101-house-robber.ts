/**
 * 198. House Robber
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/house-robber/
 *
 * Houses along a street each hold some money, given by `nums`. Robbing two
 * adjacent houses triggers the alarm. Return the maximum amount you can rob
 * without robbing any two neighbouring houses.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3, 1]
 *   Output: 4   (rob houses 0 and 2: 1 + 3)
 *
 * Example 2:
 *   Input: nums = [2, 7, 9, 3, 1]
 *   Output: 12  (rob houses 0, 2, 4: 2 + 9 + 1)
 *
 * Constraints:
 *   1 <= nums.length <= 100
 *   0 <= nums[i] <= 400
 *
 * Approach: Bottom-up DP, two variables
 *   State: dp[i] = max money robbing among the first i houses.
 *   Recurrence: dp[i] = max(dp[i - 1], dp[i - 2] + nums[i - 1]).
 *   Track only rob1 = dp[i - 2] and rob2 = dp[i - 1].
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: dp-1d
 * Key insight: At each house you either skip it (keep the best so far) or rob it (best
 *   from two houses back plus this one). Those two numbers capture everything about the
 *   past, so the answer needs O(1) memory.
 * Real world: Scheduling non-adjacent ad slots or shifts to maximize value when two
 *   neighbouring slots cannot both be used.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns the most money you can take without robbing two neighbouring houses.
export function rob(nums: number[]): number {
  // @why `rob1` means the best total using houses up to two back (before the previous house).
  let rob1 = 0;
  // @why `rob2` means the best total using houses up to the previous house.
  let rob2 = 0;
  // @why Go through the houses left to right; each decides if it joins the best plan.
  for (const n of nums) {
    // @why Either rob this house and add the best from two back, or skip it and keep `rob2`.
    const best = Math.max(rob1 + n, rob2);
    // @why Slide forward: the old `rob2` is now the best from two houses back.
    rob1 = rob2;
    // @why The new best total (up to this house) becomes the previous-house value.
    rob2 = best;
  }
  // @why `rob2` is the best total over all houses.
  return rob2;
}

test("198. House Robber", () => {
  assert.equal(rob([1, 2, 3, 1]), 4);
  assert.equal(rob([2, 7, 9, 3, 1]), 12);
  assert.equal(rob([5]), 5);
  assert.equal(rob([2, 1, 1, 2]), 4);
});
