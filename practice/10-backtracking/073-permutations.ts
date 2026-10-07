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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function permute(nums: number[]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
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
