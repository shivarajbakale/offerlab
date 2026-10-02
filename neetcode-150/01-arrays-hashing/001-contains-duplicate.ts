/**
 * 217. Contains Duplicate
 * Difficulty: Easy
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/contains-duplicate/
 *
 * Given an integer array `nums`, return true if any value appears at least
 * twice in the array, and return false if every element is distinct.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3, 1]
 *   Output: true
 *
 * Example 2:
 *   Input: nums = [1, 2, 3, 4]
 *   Output: false
 *
 * Constraints:
 *   1 <= nums.length <= 10^5
 *   -10^9 <= nums[i] <= 10^9
 *
 * Approach: Hash set
 *   Walk the array once, remembering every value seen. The first time we
 *   meet a value already in the set, we have a duplicate.
 *
 * Time: O(n)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function containsDuplicate(nums: number[]): boolean {
  const seen = new Set<number>();
  for (const n of nums) {
    if (seen.has(n)) return true;
    seen.add(n);
  }
  return false;
}

test("217. Contains Duplicate", () => {
  assert.equal(containsDuplicate([1, 2, 3, 1]), true);
  assert.equal(containsDuplicate([1, 2, 3, 4]), false);
  assert.equal(containsDuplicate([1, 1, 1, 3, 3, 4, 3, 2, 4, 2]), true);
});
