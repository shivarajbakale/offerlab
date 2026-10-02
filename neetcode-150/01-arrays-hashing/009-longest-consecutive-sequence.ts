/**
 * 128. Longest Consecutive Sequence
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/longest-consecutive-sequence/
 *
 * Given an unsorted integer array `nums`, return the length of the longest
 * run of consecutive integers (e.g. 1, 2, 3, 4) that can be formed from its
 * elements. The algorithm must run in O(n) time.
 *
 * Example 1:
 *   Input: nums = [100, 4, 200, 1, 3, 2]
 *   Output: 4   (1, 2, 3, 4)
 *
 * Example 2:
 *   Input: nums = [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]
 *   Output: 9
 *
 * Constraints:
 *   0 <= nums.length <= 10^5
 *   -10^9 <= nums[i] <= 10^9
 *
 * Approach: Hash set, start only at sequence beginnings
 *   Put all numbers in a set. A number n starts a sequence only if n - 1 is
 *   absent. From each start, count upward while n + 1 exists. Each number is
 *   visited a constant number of times overall.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: hashing
 * Key insight: Only numbers whose predecessor n - 1 is missing can start a run, so
 *   counting up from those alone touches each number a constant number of times and
 *   avoids sorting.
 * Real world: Finding the longest streak of consecutive login days for a user from an
 *   unordered set of activity dates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestConsecutive(nums: number[]): number {
  const set = new Set(nums);
  let best = 0;
  for (const n of set) {
    if (set.has(n - 1)) continue;
    let len = 1;
    while (set.has(n + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}

test("128. Longest Consecutive Sequence", () => {
  assert.equal(longestConsecutive([100, 4, 200, 1, 3, 2]), 4);
  assert.equal(longestConsecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]), 9);
  assert.equal(longestConsecutive([]), 0);
  assert.equal(longestConsecutive([1, 2, 0, 1]), 3);
});
