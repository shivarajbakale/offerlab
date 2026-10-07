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

// @rule path holds the include/skip choices for nums[0..i-1]; each push is undone by a pop
// @why Returns every possible subset of `nums`.
// @goal what are all the subsets of {JSON.stringify(nums)}?
export function subsets(nums: number[]): number[][] {
  // @why Collects all finished subsets.
  // @phase Setup
  // @say Each number is either in a subset or not: {nums.length} yes/no choices, so 2^{nums.length} = {2 ** nums.length} subsets. Make the choices one number at a time, and undo each choice to try the other.
  const res: number[][] = [];
  // @why The subset being built right now; we add and remove numbers as we explore.
  const path: number[] = [];

  // @why `dfs(i)` decides, for number `i`, whether it goes in the subset or not.
  // @goal with {JSON.stringify(path)} already chosen, which subsets can the numbers from index {i} on still make?
  const dfs = (i: number): void => {
    // @why If every number has been decided, the current path is one full subset.
    // @phase Choose include or skip for one number
    // @yes Every number has been decided, so {JSON.stringify(path)} is one complete subset.
    // @no Number {nums[i]} (index {i}) is still undecided.
    if (i === nums.length) {
      // @why Save a copy, because `path` keeps changing later.
      // @say Record a copy of {JSON.stringify(path)}. `path` itself keeps changing as choices are undone, so storing it directly would change this answer too.
      res.push([...path]); // @moment found {JSON.stringify(path)}
      // @why This branch is finished, so stop going deeper.
      // @returns nothing; this branch is complete and gave {JSON.stringify(path)}.
      return;
    }
    // @why First choice: put this number in the subset.
    // @say Choice 1: include {nums[i]}.
    path.push(nums[i]); // @ask path.length
    // @why Explore all the ways to decide the remaining numbers with it included.
    // @say With {nums[i]} in, build every subset of the remaining numbers.
    dfs(i + 1);
    // @why Backtrack: remove the number so the other choice starts from a clean path.
    // @say Every subset containing {nums[i]} (on top of what's chosen) is recorded. Undo: drop {nums[i]} so the other choice starts from the same path.
    path.pop(); // @ask path.length
    // @why Second choice: leave this number out and decide the rest.
    // @say Choice 2: skip {nums[i]} and build every subset of the rest without it.
    dfs(i + 1);
    // @returns nothing; both choices for {nums[i]} are done, so this caller's path is back to {JSON.stringify(path)}.
  };

  // @why Start deciding from the first number.
  // @phase Run the choices
  dfs(0);
  // @why After all choices are explored, `res` holds every subset.
  // @returns all {res.length} subsets: every leaf of the include/skip tree.
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
