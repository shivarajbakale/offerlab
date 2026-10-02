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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function subsetsWithDup(nums: number[]): number[][] {
  const sorted = [...nums].sort((a, b) => a - b);
  const res: number[][] = [];
  const path: number[] = [];

  const dfs = (i: number): void => {
    if (i === sorted.length) {
      res.push([...path]);
      return;
    }
    // Include sorted[i]
    path.push(sorted[i]);
    dfs(i + 1);
    path.pop();
    // Exclude sorted[i] and all of its duplicates
    while (i + 1 < sorted.length && sorted[i] === sorted[i + 1]) i++;
    dfs(i + 1);
  };

  dfs(0);
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
