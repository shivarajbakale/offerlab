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
 *
 * Pattern: backtracking
 * Key insight: In sorted order, using the same value twice as the next choice at the same
 *   depth produces identical combinations, so later copies are skipped at that level.
 *   Sorting also means once one value is too big, every later one is too, so the loop can
 *   stop.
 * Real world: Finding which unique sets of invoice line items add up to a payment amount
 *   when some line items have the same value.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule remain is target minus the sum of path; each value is tried once per level
// @why Finds unique combinations that add up to `target`; each number can be used only once.
export function combinationSum2(candidates: number[], target: number): number[][] {
  // @why Sort so equal numbers are together and we can stop early when numbers get too big.
  const sorted = [...candidates].sort((a, b) => a - b);
  // @why Collects every valid combination.
  const res: number[][] = [];
  // @why The combination being built right now.
  const path: number[] = [];

  // @why `start` is the first index we may pick from; `remain` is how much is still needed.
  const dfs = (start: number, remain: number): void => {
    // @why Remaining is zero, so the path adds up to the target.
    if (remain === 0) {
      // @why Save a copy, because `path` keeps changing.
      res.push([...path]); // @moment found {JSON.stringify(path)}
      // @why No need to go deeper.
      return;
    }
    // @why Try each candidate from `start` onward as the next pick.
    for (let i = start; i < sorted.length; i++) {
      // @why Skip a repeat of a value already tried at this spot, or we'd create duplicate combinations.
      if (i > start && sorted[i] === sorted[i - 1]) continue; // same value, same level
      // @why The list is sorted, so this and everything after it is too big.
      if (sorted[i] > remain) break; // sorted: nothing further can fit
      // @why Add this number to the combination.
      path.push(sorted[i]); // @ask remain-sorted[i]
      // @why Move to `i + 1` so each number is used at most once.
      dfs(i + 1, remain - sorted[i]);
      // @why Backtrack: remove it and try the next candidate.
      path.pop();
    }
  };

  // @why Start from index 0 needing the full `target`.
  dfs(0, target);
  // @why Return all unique combinations.
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
