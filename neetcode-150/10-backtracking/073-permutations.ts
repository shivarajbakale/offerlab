/**
 * 46. Permutations
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/permutations/
 *
 * Given an array `nums` of distinct integers, return all possible
 * permutations, in any order.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3]
 *   Output: [[1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1]]
 *
 * Example 2:
 *   Input: nums = [0, 1]
 *   Output: [[0, 1], [1, 0]]
 *
 * Example 3:
 *   Input: nums = [1]
 *   Output: [[1]]
 *
 * Constraints:
 *   1 <= nums.length <= 6
 *   -10 <= nums[i] <= 10
 *   All integers in nums are unique
 *
 * Approach: Backtracking with a used-flag array
 *   Build the permutation one position at a time. At each step try every
 *   number not yet used, mark it, recurse, then unmark it (backtrack).
 *
 * Time: O(n * n!)   Space: O(n) (excluding output)
 *
 * Pattern: backtracking
 * Key insight: Each position can take any number not yet used, so a used[] array plus
 *   undo after recursion explores all n! orderings while building only one path array.
 * Real world: Brute-force route planners trying every visiting order for a handful of
 *   stops, or test tools exercising every ordering of a few events to find race
 *   conditions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule used[i] is true exactly when nums[i] is in path; each choice is undone after use
// @why Returns every ordering of the numbers in `nums`.
// @goal what are all the orderings of {JSON.stringify(nums)}?
export function permute(nums: number[]): number[][] {
  // @why Collects all finished permutations.
  // @phase Setup
  // @say There are {nums.length}! orderings, and each must be written out, so no method beats that. The work is to build each exactly once: fill position 1, then 2, and so on, choosing only numbers not used yet, and undo each choice to try the next.
  const res: number[][] = [];
  // @why The ordering being built right now.
  const path: number[] = [];
  // @why `used[i]` marks numbers already in `path`, so none is picked twice.
  // @say A yes/no mark per number answers "is it already placed?" in O(1), instead of searching `path` each time.
  const used = new Array<boolean>(nums.length).fill(false);

  // @why Each call fills the next position of the permutation.
  // @goal with {JSON.stringify(path)} placed, which orderings can the unused numbers finish?
  const dfs = (): void => {
    // @why When `path` has all the numbers, one permutation is complete.
    // @phase Fill the next position with each unused number
    // @yes All {nums.length} positions are filled: {JSON.stringify(path)} is one complete ordering.
    // @no {path.length} of {nums.length} positions filled, so position {path.length + 1} still needs a number.
    if (path.length === nums.length) {
      // @why Save a copy, because `path` keeps changing.
      // @say Record a copy of {JSON.stringify(path)}. `path` keeps changing as choices are undone, so storing it directly would change this answer too.
      res.push([...path]); // @ask res.length // @moment found {JSON.stringify(path)}
      // @why Nothing more to add on this branch.
      // @returns nothing; this branch is complete and gave {JSON.stringify(path)}.
      return;
    }
    // @why Try every number as the next pick.
    // @yes Next candidate for position {path.length + 1}: {nums[i]} (index {i}).
    // @no Every number has been tried in position {path.length + 1}, so this level is done.
    for (let i = 0; i < nums.length; i++) {
      // @why Skip numbers already in the path.
      // @yes {nums[i]} is already placed in {JSON.stringify(path)}; using it again would repeat a number.
      // @no {nums[i]} is free, so it can go in position {path.length + 1}.
      if (used[i]) continue;
      // @why Mark this number as taken.
      // @say Mark {nums[i]} as used, so deeper positions skip it.
      used[i] = true;
      // @why Add it to the permutation.
      // @say Place {nums[i]} in position {path.length + 1}.
      path.push(nums[i]); // @ask path.length
      // @why Fill the remaining positions.
      // @say {path.length === nums.length ? "Every position is filled, so the next call just records " + JSON.stringify(path) + "." : "With " + JSON.stringify(path) + " placed, fill the remaining " + (nums.length - path.length) + (nums.length - path.length === 1 ? " position" : " positions") + " every possible way."}
      dfs();
      // @why Backtrack: remove the number from the path.
      // @say Every ordering starting {JSON.stringify(path)} is recorded. Undo: take {nums[i]} back out of position {path.length}.
      path.pop();
      // @why Free the number so other orderings can use it.
      // @say Free {nums[i]}. The next number tried in position {path.length + 1} needs {nums[i]} available for a later position.
      used[i] = false;
    }
    // @returns nothing; every unused number has had its turn in position {path.length + 1}.
  };

  // @why Start with an empty path.
  // @phase Run the choices
  // @say Start with every position empty.
  dfs();
  // @why Return all permutations.
  // @returns all {res.length} orderings, each built exactly once.
  return res;
}

const normalize = (xs: number[][]) => xs.map((x) => x.join()).sort();

test("46. Permutations", () => {
  assert.deepEqual(
    normalize(permute([1, 2, 3])),
    normalize([[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]),
  );
  assert.deepEqual(normalize(permute([0, 1])), normalize([[0, 1], [1, 0]]));
  assert.deepEqual(permute([1]), [[1]]);
  assert.equal(permute([1, 2, 3, 4, 5, 6]).length, 720);
});
