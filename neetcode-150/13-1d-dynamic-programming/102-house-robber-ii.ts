/**
 * 213. House Robber II
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/house-robber-ii/
 *
 * Same as House Robber, but the houses are arranged in a circle: the first
 * and last houses are neighbours. Return the maximum amount you can rob
 * without robbing two adjacent houses.
 *
 * Example 1:
 *   Input: nums = [2, 3, 2]
 *   Output: 3
 *
 * Example 2:
 *   Input: nums = [1, 2, 3, 1]
 *   Output: 4
 *
 * Example 3:
 *   Input: nums = [1, 2, 3]
 *   Output: 3
 *
 * Constraints:
 *   1 <= nums.length <= 100
 *   0 <= nums[i] <= 1000
 *
 * Approach: Two linear House Robber passes
 *   The first and last houses can't both be robbed, so the answer is the
 *   better of robbing nums[0..n-2] or nums[1..n-1] (linear problem each).
 *   Linear state: dp[i] = max(dp[i - 1], dp[i - 2] + nums[i]).
 *   Special-case a single house.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: dp-1d
 * Key insight: The circle only adds one constraint: the first and last house cannot both
 *   be robbed. So solve the straight-line version twice, once without the last house and
 *   once without the first, and take the better.
 * Real world: Circular scheduling like round-the-clock duty rosters, where the last shift
 *   of the day neighbours the first one and you split the cycle into two linear cases.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

function robLine(nums: number[], start: number, end: number): number {
  let rob1 = 0;
  let rob2 = 0;
  for (let i = start; i <= end; i++) {
    const best = Math.max(rob1 + nums[i], rob2);
    rob1 = rob2;
    rob2 = best;
  }
  return rob2;
}

export function rob(nums: number[]): number {
  const n = nums.length;
  if (n === 1) return nums[0];
  return Math.max(robLine(nums, 0, n - 2), robLine(nums, 1, n - 1));
}

test("213. House Robber II", () => {
  assert.equal(rob([2, 3, 2]), 3);
  assert.equal(rob([1, 2, 3, 1]), 4);
  assert.equal(rob([1, 2, 3]), 3);
  assert.equal(rob([7]), 7);
  assert.equal(rob([1, 5]), 5);
});
