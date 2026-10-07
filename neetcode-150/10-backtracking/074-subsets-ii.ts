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
 *
 * Approach: Sort + backtracking that skips equal values
 *   Sort so duplicates are adjacent. At index i, either include nums[i] and
 *   recurse at i + 1, or exclude it -- and when excluding, also skip every
 *   following copy of the same value. That way each multiset of values is
 *   generated exactly once.
 *
 * Time: O(n * 2^n)   Space: O(n) (excluding output)
 *
 * Pattern: backtracking
 * Key insight: After sorting, equal values sit together; if a value is excluded, then
 *   skipping all its copies too means each multiset is generated once instead of once per
 *   copy.
 * Real world: Generating distinct bundles from an inventory that contains identical
 *   items, so the same bundle is not listed twice.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule path is a subset of sorted[0..i-1]; skipping a value skips all its copies too
// @why Returns all subsets of `nums`, which may contain repeated numbers, without duplicate subsets.
export function subsetsWithDup(nums: number[]): number[][] {
  // @why Sort so equal numbers sit next to each other; that makes duplicates easy to skip.
  const sorted = [...nums].sort((a, b) => a - b);
  // @why Collects all unique subsets.
  const res: number[][] = [];
  // @why The subset being built right now.
  const path: number[] = [];

  // @why `dfs(i)` decides what to do with number `i`.
  const dfs = (i: number): void => {
    // @why All numbers decided, so the path is one full subset.
    if (i === sorted.length) {
      // @why Save a copy, because `path` keeps changing.
      res.push([...path]); // @ask res.length // @moment found {JSON.stringify(path)}
      // @why This branch is done.
      return;
    }
    // Include sorted[i]
    // @why First choice: include this number.
    path.push(sorted[i]); // @ask path.length
    // @why Decide the rest with it included.
    dfs(i + 1);
    // @why Backtrack: remove it.
    path.pop();
    // Exclude sorted[i] and all of its duplicates
    // @why If we skip this number, we must skip all its equal neighbors too, or we'd repeat subsets.
    while (i + 1 < sorted.length && sorted[i] === sorted[i + 1]) i++;
    // @why Decide the rest with this value left out.
    dfs(i + 1);
  };

  // @why Start from the first number.
  dfs(0);
  // @why Return all unique subsets.
  return res;
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
