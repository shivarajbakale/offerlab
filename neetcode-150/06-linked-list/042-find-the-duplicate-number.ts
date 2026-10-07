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
 *
 * Pattern: fast-slow-pointers
 * Key insight: Reading nums as a function i -> nums[i] turns the array into a linked
 *   list; the duplicate value has two incoming arrows, so it is exactly where the cycle
 *   starts. Floyd's second phase (one pointer from 0, one from the meeting point) lands
 *   on that entrance without modifying the array or using extra memory.
 * Real world: Detecting a loop in a chain of redirects or symlinks stored as an id ->
 *   next-id table, finding where the loop begins without allocating a visited set.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule walking i -> nums[i] from 0, fast has taken twice as many steps as slow
// @why Treat `nums[i]` as a pointer from i to nums[i]; the duplicate is where a cycle starts.
export function findDuplicate(nums: number[]): number {
  // @why `slow` takes one step per round.
  let slow = 0;
  // @why `fast` takes two steps per round; both start at index 0.
  let fast = 0;
  // @why Run at least once, because both pointers start equal.
  do {
    // @why Slow follows one pointer.
    slow = nums[slow]; // @ask slow
    // @why Fast follows two pointers.
    fast = nums[nums[fast]]; // @ask fast
  // @why Stop when they meet; that spot is somewhere inside the cycle.
  } while (slow !== fast);

  // @why A second walker from the start; it meets `slow` at the cycle entrance.
  let slow2 = 0; // @moment met inside the cycle at {slow}
  // @why Move both one step at a time until they meet.
  while (slow !== slow2) {
    // @why Slow takes one step.
    slow = nums[slow];
    // @why The second walker takes one step.
    slow2 = nums[slow2]; // @ask slow2
  }
  // @why The cycle entrance is the number that appears twice.
  return slow;
}

test("287. Find the Duplicate Number", () => {
  assert.equal(findDuplicate([1, 3, 4, 2, 2]), 2);
  assert.equal(findDuplicate([3, 1, 3, 4, 2]), 3);
  assert.equal(findDuplicate([3, 3, 3, 3, 3]), 3);
  assert.equal(findDuplicate([1, 1]), 1);
  assert.equal(findDuplicate([2, 5, 9, 6, 9, 3, 8, 9, 7, 1]), 9);
});
