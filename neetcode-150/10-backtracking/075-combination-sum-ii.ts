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
 *
 * Approach: Sort + backtracking, skip duplicates at the same depth
 *   Sort the candidates. From a start index, try each candidate as the next
 *   element, but skip a value equal to the previous one tried at this same
 *   level (it would produce the same combinations). Since the array is
 *   sorted, stop the loop once a candidate exceeds the remaining target.
 *
 * Time: O(n * 2^n)   Space: O(n) (excluding output)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function combinationSum2(candidates: number[], target: number): number[][] {
  const sorted = [...candidates].sort((a, b) => a - b);
  const res: number[][] = [];
  const path: number[] = [];

  const dfs = (start: number, remain: number): void => {
    if (remain === 0) {
      res.push([...path]);
      return;
    }
    for (let i = start; i < sorted.length; i++) {
      if (i > start && sorted[i] === sorted[i - 1]) continue; // same value, same level
      if (sorted[i] > remain) break; // sorted: nothing further can fit
      path.push(sorted[i]);
      dfs(i + 1, remain - sorted[i]);
      path.pop();
    }
  };

  dfs(0, target);
  return res;
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
