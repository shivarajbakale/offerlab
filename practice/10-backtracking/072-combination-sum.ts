/**
 * 39. Combination Sum
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/combination-sum/
 *
 * Given an array of distinct positive integers `candidates` and a `target`,
 * return all unique combinations of candidates that sum to `target`. Each
 * candidate may be used an unlimited number of times. Two combinations are
 * the same if they use each number the same number of times. Any order.
 *
 * Example 1:
 *   Input: candidates = [2, 3, 6, 7], target = 7
 *   Output: [[2, 2, 3], [7]]
 *
 * Example 2:
 *   Input: candidates = [2, 3, 5], target = 8
 *   Output: [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
 *
 * Example 3:
 *   Input: candidates = [2], target = 1
 *   Output: []
 *
 * Constraints:
 *   1 <= candidates.length <= 30
 *   2 <= candidates[i] <= 40, all distinct
 *   1 <= target <= 40
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function combinationSum(candidates: number[], target: number): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

const normalize = (xs: number[][]) =>
  xs.map((x) => [...x].sort((a, b) => a - b)).sort((a, b) => a.join() < b.join() ? -1 : 1);

test("39. Combination Sum", () => {
  assert.deepEqual(normalize(combinationSum([2, 3, 6, 7], 7)), normalize([[2, 2, 3], [7]]));
  assert.deepEqual(
    normalize(combinationSum([2, 3, 5], 8)),
    normalize([[2, 2, 2, 2], [2, 3, 3], [3, 5]]),
  );
  assert.deepEqual(combinationSum([2], 1), []);
  assert.deepEqual(combinationSum([1], 2), [[1, 1]]);
});
