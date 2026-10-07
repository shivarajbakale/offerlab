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
 *
 * Pattern: hashing
 * Key insight: A set answers "have I seen this before?" in O(1), so the first repeat can
 *   be caught the moment it appears instead of comparing every pair.
 * Real world: A payment service rejecting a webhook whose event ID it has already
 *   processed, using a set of seen IDs for idempotency.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule seen holds every number before n, and no two of them are equal
// @why Return true as soon as any value shows up a second time.
// @goal does any value in {JSON.stringify(nums)} appear twice?
export function containsDuplicate(nums: number[]): boolean {
  // @why A set remembers every value we passed and checks membership instantly.
  // @phase Setup: an empty memory of values passed
  // @say Comparing every pair is n² work. A repeat only needs one earlier copy, so remember each value as we pass it and ask the memory instead.
  const seen = new Set<number>();
  // @why Look at each number once, left to right.
  // @phase One pass: each value checks the memory, then joins it
  // @say Next value: {n}. Everything before it is already in `seen`, so one lookup compares {n} against all of them at once.
  for (const n of nums) {
    // @why If we already stored this value, it is a repeat, so we can stop with the answer.
    // @yes {n} is already in {JSON.stringify([...seen])}: an earlier copy exists, so this is a repeat. No later value can change that answer, so stop now.
    // @no {n} is not in {JSON.stringify([...seen])}, so no earlier value equals it. It may still match a later value, so keep it.
    // @returns true: one repeat is enough, the rest of the array does not matter.
    if (seen.has(n)) return true; // @ask seen.has(n)
    // @why First time seeing it, so store it for later numbers to be checked against.
    // @then `seen` = {JSON.stringify([...seen])}: every value so far is distinct, and each later value will be checked against all of them.
    seen.add(n);
  }
  // @why We never hit a repeat, so every value was different.
  // @phase Verdict: no value repeated
  // @say Every value checked the memory and none was already there, so all {nums.length} values are distinct.
  // @returns false: no value ever found an earlier copy.
  return false;
}

test("217. Contains Duplicate", () => {
  assert.equal(containsDuplicate([1, 2, 3, 1]), true);
  assert.equal(containsDuplicate([1, 2, 3, 4]), false);
  assert.equal(containsDuplicate([1, 1, 1, 3, 3, 4, 3, 2, 4, 2]), true);
});
