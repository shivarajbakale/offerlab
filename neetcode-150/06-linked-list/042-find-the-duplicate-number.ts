/**
 * 287. Find the Duplicate Number
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/find-the-duplicate-number/
 *
 * Given an array `nums` of n + 1 integers where each value is in [1, n],
 * exactly one value is repeated (possibly more than twice). Return that
 * value without modifying the array and using only O(1) extra space.
 *
 * Example 1:
 *   Input: nums = [1, 3, 4, 2, 2]
 *   Output: 2
 *
 * Example 2:
 *   Input: nums = [3, 1, 3, 4, 2]
 *   Output: 3
 *
 * Example 3:
 *   Input: nums = [3, 3, 3, 3, 3]
 *   Output: 3
 *
 * Constraints:
 *   1 <= n <= 10^5
 *   nums.length == n + 1
 *   1 <= nums[i] <= n
 *   Exactly one integer appears two or more times.
 *
 * Approach: Floyd's cycle detection on index -> value links
 *   Treat each index i as a node pointing to nums[i]. Index 0 is never a
 *   target (values are >= 1), so starting from 0 we walk into a cycle whose
 *   entrance is the duplicate value. Phase 1: slow/fast meet inside the
 *   cycle. Phase 2: a pointer from the start and one from the meeting point,
 *   both moving one step, meet at the cycle entrance.
 *
 * Time: O(n)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findDuplicate(nums: number[]): number {
  let slow = 0;
  let fast = 0;
  do {
    slow = nums[slow];
    fast = nums[nums[fast]];
  } while (slow !== fast);

  let slow2 = 0;
  while (slow !== slow2) {
    slow = nums[slow];
    slow2 = nums[slow2];
  }
  return slow;
}

test("287. Find the Duplicate Number", () => {
  assert.equal(findDuplicate([1, 3, 4, 2, 2]), 2);
  assert.equal(findDuplicate([3, 1, 3, 4, 2]), 3);
  assert.equal(findDuplicate([3, 3, 3, 3, 3]), 3);
  assert.equal(findDuplicate([1, 1]), 1);
  assert.equal(findDuplicate([2, 5, 9, 6, 9, 3, 8, 9, 7, 1]), 9);
});
