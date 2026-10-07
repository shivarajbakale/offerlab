/**
 * 312. Burst Balloons
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/burst-balloons/
 *
 * There are n balloons, each painted with a number `nums[i]`. Bursting
 * balloon i earns nums[i - 1] * nums[i] * nums[i + 1] coins, where the
 * neighbours are whichever balloons are currently adjacent to it; an
 * out-of-range neighbour counts as 1. After a burst, its neighbours become
 * adjacent. Return the maximum coins you can collect by bursting them all.
 *
 * Example 1:
 *   Input: nums = [3, 1, 5, 8]
 *   Output: 167
 *   (3*1*5 + 3*5*8 + 1*3*8 + 1*8*1 = 15 + 120 + 24 + 8)
 *
 * Example 2:
 *   Input: nums = [1, 5]
 *   Output: 10
 *
 * Constraints:
 *   1 <= nums.length <= 300
 *   0 <= nums[i] <= 100
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxCoins(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("312. Burst Balloons", () => {
  assert.equal(maxCoins([3, 1, 5, 8]), 167);
  assert.equal(maxCoins([1, 5]), 10);
  assert.equal(maxCoins([7]), 7);
  assert.equal(maxCoins([0, 0]), 0);
});
