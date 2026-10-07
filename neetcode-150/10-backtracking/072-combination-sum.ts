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
 *
 * Approach: Backtracking with a start index
 *   At index i either take candidates[i] again (stay at i) or skip it
 *   forever (move to i + 1). Never going back to earlier indices prevents
 *   duplicate combinations. Prune when the running total exceeds target.
 *
 * Time: O(2^(t/m)) where t = target, m = min candidate   Space: O(t/m)
 *
 * Pattern: backtracking
 * Key insight: Staying at index i allows reusing a number, and only ever moving forward
 *   forbids revisiting earlier ones, so each combination is built in one canonical order
 *   and never appears twice. Stopping when the total exceeds target cuts dead branches.
 * Real world: Making change or packing orders from unlimited stock in fixed sizes, such
 *   as listing every way to fill a quantity with standard package sizes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule total is always the sum of path; candidates before i are never picked again
// @why Finds all combinations of `candidates` that add up to `target`; numbers can be reused.
export function combinationSum(candidates: number[], target: number): number[][] {
  // @why Collects every valid combination.
  const res: number[][] = [];
  // @why The combination being built right now.
  const path: number[] = [];

  // @why `i` is which candidate we are considering; `total` is the sum so far.
  const dfs = (i: number, total: number): void => {
    // @why Hit the target exactly, so this path is a valid answer.
    if (total === target) {
      // @why Save a copy, because `path` keeps changing.
      res.push([...path]); // @ask res.length // @moment found {JSON.stringify(path)}
      // @why No need to go deeper; adding more would overshoot.
      return;
    }
    // @why Stop if we ran out of candidates or the sum is already too big (all numbers are positive).
    if (i >= candidates.length || total > target) return;

    // @why First choice: take candidate `i`.
    path.push(candidates[i]); // reuse candidates[i] // @ask path.length
    // @why Stay on the same index, because the same number may be used again.
    dfs(i, total + candidates[i]);
    // @why Backtrack: remove it so we can try not using it.
    path.pop(); // move on to the next candidate
    // @why Second choice: skip this candidate and move to the next one.
    dfs(i + 1, total);
  };

  // @why Begin at the first candidate with a sum of 0.
  dfs(0, 0);
  // @why Return all combinations found.
  return res;
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
