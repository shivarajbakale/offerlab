/**
 * 15. 3Sum
 * Difficulty: Medium
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/3sum/
 *
 * Given an integer array `nums`, return all unique triplets
 * [nums[i], nums[j], nums[k]] with distinct indices i, j, k such that
 * nums[i] + nums[j] + nums[k] == 0. The result must not contain duplicate
 * triplets; order of triplets and of values within them does not matter.
 *
 * Example 1:
 *   Input: nums = [-1, 0, 1, 2, -1, -4]
 *   Output: [[-1, -1, 2], [-1, 0, 1]]
 *
 * Example 2:
 *   Input: nums = [0, 1, 1]
 *   Output: []
 *
 * Example 3:
 *   Input: nums = [0, 0, 0]
 *   Output: [[0, 0, 0]]
 *
 * Constraints:
 *   3 <= nums.length <= 3000
 *   -10^5 <= nums[i] <= 10^5
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function threeSum(nums: number[]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

function normalize(triplets: number[][]): number[][] {
  return triplets
    .map((t) => [...t].sort((x, y) => x - y))
    .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
}

test("15. 3Sum", () => {
  assert.deepEqual(
    normalize(threeSum([-1, 0, 1, 2, -1, -4])),
    [[-1, -1, 2], [-1, 0, 1]],
  );
  assert.deepEqual(threeSum([0, 1, 1]), []);
  assert.deepEqual(threeSum([0, 0, 0]), [[0, 0, 0]]);
  assert.deepEqual(
    normalize(threeSum([-2, 0, 0, 2, 2])),
    [[-2, 0, 2]],
  );
});
