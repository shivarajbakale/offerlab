/**
 * 90. Subsets II
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/subsets-ii/
 *
 * Given an integer array `nums` that may contain duplicates, return all
 * possible subsets (the power set). The result must not contain duplicate
 * subsets and may be returned in any order.
 *
 * Example 1:
 *   Input: nums = [1, 2, 2]
 *   Output: [[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]
 *
 * Example 2:
 *   Input: nums = [0]
 *   Output: [[], [0]]
 *
 * Constraints:
 *   1 <= nums.length <= 10
 *   -10 <= nums[i] <= 10
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function subsetsWithDup(nums: number[]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

const normalize = (xs: number[][]) =>
  xs.map((x) => [...x].sort((a, b) => a - b).join()).sort();

test("90. Subsets II", () => {
  assert.deepEqual(
    normalize(subsetsWithDup([1, 2, 2])),
    normalize([[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]),
  );
  assert.deepEqual(normalize(subsetsWithDup([0])), normalize([[], [0]]));
  assert.deepEqual(normalize(subsetsWithDup([2, 2, 2])), normalize([[], [2], [2, 2], [2, 2, 2]]));
});
