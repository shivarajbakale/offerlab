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
 *
 * Pattern: backtracking
 * Key insight: Every subset corresponds to one include/exclude choice per element, so a
 *   binary decision tree of depth n reaches each of the 2^n subsets exactly once. Undoing
 *   the push after recursing lets one path array be reused.
 * Real world: Feature-flag or test-configuration generators that enumerate every
 *   combination of on/off options.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns every possible subset of `nums`.
export function subsets(nums: number[]): number[][] {
  // @why Collects all finished subsets.
  const res: number[][] = [];
  // @why The subset being built right now; we add and remove numbers as we explore.
  const path: number[] = [];

  // @why `dfs(i)` decides, for number `i`, whether it goes in the subset or not.
  const dfs = (i: number): void => {
    // @why If every number has been decided, the current path is one full subset.
    if (i === nums.length) { // @say Decided on every number: the path is one complete subset
      // @why Save a copy, because `path` keeps changing later.
      res.push([...path]); // @say Record a copy of {path}, since path keeps changing
      // @why This branch is finished, so stop going deeper.
      return;
    }
    // @why First choice: put this number in the subset.
    path.push(nums[i]); // @say Choice 1: include {nums[i]} in the subset
    // @why Explore all the ways to decide the remaining numbers with it included.
    dfs(i + 1);
    // @why Backtrack: remove the number so the other choice starts from a clean path.
    path.pop(); // @say Undo: drop {nums[i]} so we can explore subsets without it
    // @why Second choice: leave this number out and decide the rest.
    dfs(i + 1); // @say Choice 2: skip {nums[i]} and decide on the next number
  };

  // @why Start deciding from the first number.
  dfs(0);
  // @why After all choices are explored, `res` holds every subset.
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
