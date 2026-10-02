/**
 * 167. Two Sum II - Input Array Is Sorted
 * Difficulty: Medium
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
 *
 * Given a 1-indexed array `numbers` sorted in non-decreasing order, find two
 * numbers that add up to `target` and return their indices [index1, index2]
 * (1-indexed, index1 < index2). Exactly one solution exists, the same element
 * may not be used twice, and only constant extra space may be used.
 *
 * Example 1:
 *   Input: numbers = [2, 7, 11, 15], target = 9
 *   Output: [1, 2]
 *
 * Example 2:
 *   Input: numbers = [2, 3, 4], target = 6
 *   Output: [1, 3]
 *
 * Example 3:
 *   Input: numbers = [-1, 0], target = -1
 *   Output: [1, 2]
 *
 * Constraints:
 *   2 <= numbers.length <= 3 * 10^4
 *   -1000 <= numbers[i], target <= 1000
 *   Exactly one valid answer exists.
 *
 * Approach: Two pointers from both ends
 *   If the sum is too large, move the right pointer left; if too small, move
 *   the left pointer right. Sortedness guarantees we never skip the answer.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: two-pointers
 * Key insight: In a sorted array, if the sum is too big the right element cannot pair
 *   with anything at or after l, so it can be discarded; each step removes one candidate
 *   for good.
 * Real world: Matching two sorted price lists to find an item pair that exactly fits a
 *   gift card balance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function twoSum(numbers: number[], target: number): number[] {
  let l = 0;
  let r = numbers.length - 1;
  while (l < r) {
    const sum = numbers[l] + numbers[r];
    if (sum === target) return [l + 1, r + 1];
    if (sum > target) r--;
    else l++;
  }
  return [];
}

test("167. Two Sum II - Input Array Is Sorted", () => {
  assert.deepEqual(twoSum([2, 7, 11, 15], 9), [1, 2]);
  assert.deepEqual(twoSum([2, 3, 4], 6), [1, 3]);
  assert.deepEqual(twoSum([-1, 0], -1), [1, 2]);
  assert.deepEqual(twoSum([1, 2, 3, 4, 4, 9], 8), [4, 5]);
});
