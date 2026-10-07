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
// @goal which two numbers in {JSON.stringify(nums)} add up to {target}?
export function twoSum(nums: number[], target: number): number[] {
  // @why Map from a number to its index, for numbers already passed.
  // @phase Setup: an empty memory of numbers seen so far
  // @say Checking every pair is n² work. Instead, remember each number as we pass it, so a later number can ask "is my partner here?" in one lookup.
  const indexOf = new Map<number, number>();
  // @why Visit each number once; earlier numbers are already in the map.
  // @phase One pass: each number looks back for its partner, then waits for later ones
  // @yes Next up is index {i} (value {nums[i]}). Everything before it is already in the map, so one lookup covers all pairs that end at {i}.
  // @no Every number has looked back and none found a partner. The problem promises a pair, so this only happens on bad input.
  for (let i = 0; i < nums.length; i++) {
    // @why The partner this number needs is `target - nums[i]`; look for it in the map.
    // @say {nums[i]} can only pair with exactly {target} − {nums[i]} = {target - nums[i]}. No other value works, so instead of scanning, ask the map one question: was {target - nums[i]} seen before?
    const j = indexOf.get(target - nums[i]); // @ask j!==undefined
    // @why The partner was seen earlier, so these two indices are the answer.
    // @yes Found it: nums[{j}] + nums[{i}] = {nums[j]} + {nums[i]} = {target}. The partner came earlier, so its index {j} is the first half of the answer.
    // @returns indices {j} and {i}. The problem promises exactly one pair, so the first one found is the answer.
    // @no {target - nums[i]} hasn't appeared yet. That does not rule {nums[i]} out: its partner may still be ahead, so keep it around instead of giving up on it.
    if (j !== undefined) return [j, i];
    // @why No partner yet, so store this number for the numbers that come later.
    // @say Store {nums[i]} → index {i}. Now if any later number needs {nums[i]}, it finds it in one lookup, without rescanning the array.
    // @then The map now covers indices 0..{i}, and every pair ending at index {i} has been checked.
    indexOf.set(nums[i], i);
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
