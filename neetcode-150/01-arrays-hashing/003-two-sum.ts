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
 *
 * Pattern: hashing
 * Key insight: For each number the partner it needs is fixed (target - n), so instead of
 *   searching for it later you look it up among numbers already seen; storing value ->
 *   index makes that lookup O(1).
 * Real world: A reconciliation tool matching an incoming refund to the earlier charge
 *   that cancels it, by looking up the needed amount in a map of open charges.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule indexOf holds every number before i, mapped to its index
// @why Return the two indices whose numbers add up to `target`.
export function twoSum(nums: number[], target: number): number[] {
  // @why Map from a number to its index, for numbers already passed.
  const indexOf = new Map<number, number>();
  // @why Visit each number once; earlier numbers are already in the map.
  for (let i = 0; i < nums.length; i++) {
    // @why The partner this number needs is `target - nums[i]`; look for it in the map.
    const j = indexOf.get(target - nums[i]); // @ask j!==undefined // @say {nums[i]} needs a partner of {target - nums[i]}; have we seen it before?
    // @why The partner was seen earlier, so these two indices are the answer.
    if (j !== undefined) return [j, i]; // @say If the complement was stored earlier, those two indices are the pair
    // @why No partner yet, so store this number for the numbers that come later.
    indexOf.set(nums[i], i); // @say Remember {nums[i]} at index {i} so a later number can pair with it
  }
  // @why Just a safe default; the problem promises an answer exists.
  return [];
}

test("1. Two Sum", () => {
  assert.deepEqual(twoSum([2, 7, 11, 15], 9), [0, 1]);
  assert.deepEqual(twoSum([3, 2, 4], 6), [1, 2]);
  assert.deepEqual(twoSum([3, 3], 6), [0, 1]);
  assert.deepEqual(twoSum([-3, 4, 3, 90], 0), [0, 2]);
});
