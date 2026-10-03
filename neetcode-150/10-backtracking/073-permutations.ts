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

// @why Returns every ordering of the numbers in `nums`.
export function permute(nums: number[]): number[][] {
  // @why Collects all finished permutations.
  const res: number[][] = [];
  // @why The ordering being built right now.
  const path: number[] = [];
  // @why `used[i]` marks numbers already in `path`, so none is picked twice.
  const used = new Array<boolean>(nums.length).fill(false);

  // @why Each call fills the next position of the permutation.
  const dfs = (): void => {
    // @why When `path` has all the numbers, one permutation is complete.
    if (path.length === nums.length) {
      // @why Save a copy, because `path` keeps changing.
      res.push([...path]);
      // @why Nothing more to add on this branch.
      return;
    }
    // @why Try every number as the next pick.
    for (let i = 0; i < nums.length; i++) {
      // @why Skip numbers already in the path.
      if (used[i]) continue;
      // @why Mark this number as taken.
      used[i] = true;
      // @why Add it to the permutation.
      path.push(nums[i]);
      // @why Fill the remaining positions.
      dfs();
      // @why Backtrack: remove the number from the path.
      path.pop();
      // @why Free the number so other orderings can use it.
      used[i] = false;
    }
  };

  // @why Start with an empty path.
  dfs();
  // @why Return all permutations.
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
