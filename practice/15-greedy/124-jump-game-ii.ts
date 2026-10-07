/**
 * 45. Jump Game II
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/jump-game-ii/
 *
 * You start at index 0 of an integer array `nums`, where nums[i] is the
 * maximum forward jump from index i. Return the minimum number of jumps
 * needed to reach the last index. The input guarantees it is reachable.
 *
 * Example 1:
 *   Input: nums = [2, 3, 1, 1, 4]
 *   Output: 2   (0 -> 1 -> 4)
 *
 * Example 2:
 *   Input: nums = [2, 3, 0, 1, 4]
 *   Output: 2
 *
 * Constraints:
 *   1 <= nums.length <= 10^4
 *   0 <= nums[i] <= 1000
 *   The last index is always reachable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function jump(nums: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("45. Jump Game II", () => {
  assert.equal(jump([2, 3, 1, 1, 4]), 2);
  assert.equal(jump([2, 3, 0, 1, 4]), 2);
  assert.equal(jump([0]), 0); // already at the end
  assert.equal(jump([1, 1, 1, 1]), 3);
});
