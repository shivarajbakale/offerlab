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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function rob(nums: number[]): number {
  let rob1 = 0;
  let rob2 = 0;
  for (const n of nums) {
    const best = Math.max(rob1 + n, rob2);
    rob1 = rob2;
    rob2 = best;
  }
  return rob2;
}

test("198. House Robber", () => {
  assert.equal(rob([1, 2, 3, 1]), 4);
  assert.equal(rob([2, 7, 9, 3, 1]), 12);
  assert.equal(rob([5]), 5);
  assert.equal(rob([2, 1, 1, 2]), 4);
});
