/**
 * 1. Two Sum
 * Difficulty: Easy
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/two-sum/
 *
 * Given an array of integers `nums` and an integer `target`, return the
 * indices of the two numbers that add up to `target`. Exactly one solution
 * exists, and the same element may not be used twice. Return the indices in
 * any order.
 *
 * Example 1:
 *   Input: nums = [2, 7, 11, 15], target = 9
 *   Output: [0, 1]
 *
 * Example 2:
 *   Input: nums = [3, 2, 4], target = 6
 *   Output: [1, 2]
 *
 * Example 3:
 *   Input: nums = [3, 3], target = 6
 *   Output: [0, 1]
 *
 * Constraints:
 *   2 <= nums.length <= 10^4
 *   -10^9 <= nums[i], target <= 10^9
 *   Exactly one valid answer exists.
 *
 * Approach: One-pass hash map
 *   Map each value to its index as we go. For each number, check whether its
 *   complement (target - n) was already seen; if so, we have the pair.
 *
 * Time: O(n)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function twoSum(nums: number[], target: number): number[] {
  const indexOf = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = indexOf.get(target - nums[i]);
    if (j !== undefined) return [j, i];
    indexOf.set(nums[i], i);
  }
  return [];
}

test("1. Two Sum", () => {
  assert.deepEqual(twoSum([2, 7, 11, 15], 9), [0, 1]);
  assert.deepEqual(twoSum([3, 2, 4], 6), [1, 2]);
  assert.deepEqual(twoSum([3, 3], 6), [0, 1]);
  assert.deepEqual(twoSum([-3, 4, 3, 90], 0), [0, 2]);
});
