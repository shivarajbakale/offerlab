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
 *
 * Approach: Backtracking (include / exclude)
 *   At each index decide whether to include nums[i]. When the index reaches
 *   the end, the current path is one subset.
 *
 * Time: O(n * 2^n)   Space: O(n) recursion (excluding output)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function subsets(nums: number[]): number[][] {
  const res: number[][] = [];
  const path: number[] = [];

  const dfs = (i: number): void => {
    if (i === nums.length) {
      res.push([...path]);
      return;
    }
    path.push(nums[i]); // include nums[i]
    dfs(i + 1);
    path.pop(); // exclude nums[i]
    dfs(i + 1);
  };

  dfs(0);
  return res;
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
