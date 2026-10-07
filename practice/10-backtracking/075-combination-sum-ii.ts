/**
 * 40. Combination Sum II
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/combination-sum-ii/
 *
 * Given a collection of candidate numbers `candidates` (which may contain
 * duplicates) and a `target`, return all unique combinations that sum to
 * `target`. Each number may be used at most once per combination, and the
 * result must not contain duplicate combinations. Any order.
 *
 * Example 1:
 *   Input: candidates = [10, 1, 2, 7, 6, 1, 5], target = 8
 *   Output: [[1, 1, 6], [1, 2, 5], [1, 7], [2, 6]]
 *
 * Example 2:
 *   Input: candidates = [2, 5, 2, 1, 2], target = 5
 *   Output: [[1, 2, 2], [5]]
 *
 * Constraints:
 *   1 <= candidates.length <= 100
 *   1 <= candidates[i] <= 50
 *   1 <= target <= 30
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function combinationSum2(candidates: number[], target: number): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

const normalize = (xs: number[][]) =>
  xs.map((x) => [...x].sort((a, b) => a - b).join()).sort();

test("40. Combination Sum II", () => {
  assert.deepEqual(
    normalize(combinationSum2([10, 1, 2, 7, 6, 1, 5], 8)),
    normalize([[1, 1, 6], [1, 2, 5], [1, 7], [2, 6]]),
  );
  assert.deepEqual(normalize(combinationSum2([2, 5, 2, 1, 2], 5)), normalize([[1, 2, 2], [5]]));
  assert.deepEqual(combinationSum2([2], 1), []);
});
