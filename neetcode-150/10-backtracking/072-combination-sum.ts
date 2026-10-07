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
// @goal which combinations of {JSON.stringify(candidates)}, each usable any number of times, add up to {target}?
export function combinationSum(candidates: number[], target: number): number[][] {
  // @why Collects every valid combination.
  // @phase Setup
  // @say Listing every multiset of candidates and summing each would never end, since numbers repeat freely. Instead build one combination at a time: at each step either take candidate i again or move past it for good, and stop a branch as soon as its sum passes {target}.
  const res: number[][] = [];
  // @why The combination being built right now.
  const path: number[] = [];

  // @why `i` is which candidate we are considering; `total` is the sum so far.
  // @goal with {JSON.stringify(path)} chosen (sum {total}), which combinations can candidates from index {i} on still finish?
  const dfs = (i: number, total: number): void => {
    // @why Hit the target exactly, so this path is a valid answer.
    // @phase Take candidate i again, or move past it
    // @yes {JSON.stringify(path)} sums to exactly {target}: a valid combination.
    // @no The sum is {total}, {total < target ? "still short of " + target : "already past " + target}.
    if (total === target) {
      // @why Save a copy, because `path` keeps changing.
      // @say Record a copy of {JSON.stringify(path)}. `path` keeps changing as choices are undone, so storing it directly would change this answer too.
      res.push([...path]); // @ask res.length // @moment found {JSON.stringify(path)}
      // @why No need to go deeper; adding more would overshoot.
      // @returns nothing; every candidate is positive, so adding more could only overshoot {target}.
      return;
    }
    // @why Stop if we ran out of candidates or the sum is already too big (all numbers are positive).
    // @yes {total > target ? "The sum " + total + " already passed " + target + ", and every candidate is positive, so no extension can come back down" : "No candidates are left to try, and the sum " + total + " is still short of " + target}. Dead end.
    // @no The sum {total} is short of {target} and candidate {candidates[i]} is still available, so keep going.
    // @returns nothing; this branch can't reach {target}.
    if (i >= candidates.length || total > target) return;

    // @why First choice: take candidate `i`.
    // @say Choice 1: take {candidates[i]}, making the sum {total} + {candidates[i]} = {total + candidates[i]}.
    path.push(candidates[i]); // reuse candidates[i] // @ask path.length
    // @why Stay on the same index, because the same number may be used again.
    // @say Recurse with i still {i}: {candidates[i]} may be used again, so it must stay on offer.
    dfs(i, total + candidates[i]);
    // @why Backtrack: remove it so we can try not using it.
    // @say Every combination that takes another {candidates[i]} here has been explored. Undo: drop it so the other choice starts from {JSON.stringify(path.slice(0, -1))}.
    path.pop(); // move on to the next candidate
    // @why Second choice: skip this candidate and move to the next one.
    // @say Choice 2: never use {candidates[i]} again on this branch. Moving past it for good is what keeps [2,3] and [3,2] from both being found.
    dfs(i + 1, total);
    // @returns nothing; both choices for {candidates[i]} are done, and path is back to {JSON.stringify(path)}.
  };

  // @why Begin at the first candidate with a sum of 0.
  // @phase Run the choices
  // @say Start with nothing chosen: sum 0, first candidate {candidates[0]}.
  dfs(0, 0);
  // @why Return all combinations found.
  // @returns {JSON.stringify(res)}: every branch that landed exactly on {target}.
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
