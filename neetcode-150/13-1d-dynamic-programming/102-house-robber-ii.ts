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

// @why The plain House Robber on a straight row `start..end`, returning the best total.
function robLine(nums: number[], start: number, end: number): number {
  // @why `rob1` means the best total up to two houses back.
  let rob1 = 0;
  // @why `rob2` means the best total up to the previous house.
  let rob2 = 0;
  // @why Only look at houses in the chosen range.
  for (let i = start; i <= end; i++) {
    // @why Rob this house (plus best from two back) or skip it (keep `rob2`); pick the bigger.
    const best = Math.max(rob1 + nums[i], rob2); // @ask best
    // @why Slide forward so `rob1` lags `rob2` by one house.
    rob1 = rob2;
    // @why Save the new best as the previous-house value.
    rob2 = best;
  }
  // @why The best total for this straight row.
  return rob2;
}

// @viz best:rob2
// @rule rob2 is the most money from houses start..i; rob1, from start..i - 1
// @why Returns the most you can rob when the houses form a circle, so first and last touch.
export function rob(nums: number[]): number {
  // @why Count the houses once for the range checks below.
  const n = nums.length;
  // @why With one house there is no neighbour problem, and the two ranges below would be empty.
  if (n === 1) return nums[0];
  // @why First and last are neighbours, so never rob both: try skipping the last, or skipping the first, and take the better.
  return Math.max(robLine(nums, 0, n - 2), robLine(nums, 1, n - 1));
}

test("213. House Robber II", () => {
  assert.equal(rob([2, 3, 2]), 3);
  assert.equal(rob([1, 2, 3, 1]), 4);
  assert.equal(rob([1, 2, 3]), 3);
  assert.equal(rob([7]), 7);
  assert.equal(rob([1, 5]), 5);
});
