/**
 * 78. Subsets
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/subsets/
 *
 * Given an integer array `nums` of unique elements, return all possible
 * subsets (the power set). The result must not contain duplicate subsets and
 * may be returned in any order.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3]
 *   Output: [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]
 *
 * Example 2:
 *   Input: nums = [0]
 *   Output: [[], [0]]
 *
 * Constraints:
 *   1 <= nums.length <= 10
 *   -10 <= nums[i] <= 10
 *   All numbers in nums are unique
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function subsets(nums: number[]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

const normalize = (xs: number[][]) =>
  xs.map((x) => [...x].sort((a, b) => a - b)).sort((a, b) => a.join() < b.join() ? -1 : 1);

test("78. Subsets", () => {
  assert.deepEqual(
    normalize(subsets([1, 2, 3])),
    normalize([[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]),
  );
  assert.deepEqual(normalize(subsets([0])), normalize([[], [0]]));
  assert.equal(subsets([1, 2, 3, 4, 5]).length, 32);
});
