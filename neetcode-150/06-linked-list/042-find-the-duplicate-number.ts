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
// @goal which number appears twice in {JSON.stringify(nums)}?
export function findDuplicate(nums: number[]): number {
  // @why `slow` takes one step per round.
  // @phase Setup: read the array as a linked list
  // @say A set finds the repeat in O(n) space, and sorting changes the array. Instead read each index i as a node pointing to index nums[i]. Two indices point at the duplicate, so that node has two arrows in: the walk from 0 enters a loop exactly there. Find the loop's entrance with two runners and O(1) space.
  let slow = 0;
  // @why `fast` takes two steps per round; both start at index 0.
  let fast = 0;
  // @why Run at least once, because both pointers start equal.
  // @phase Phase 1: race until the runners meet inside the loop
  do {
    // @why Slow follows one pointer.
    // @say slow follows one arrow: {slow} → nums[{slow}] = {nums[slow]}.
    slow = nums[slow]; // @ask slow
    // @why Fast follows two pointers.
    // @say fast follows two arrows: {fast} → {nums[fast]} → {nums[nums[fast]]}.
    // @then {slow === fast ? "Both on " + slow + ": they met, somewhere inside the loop." : "slow on " + slow + ", fast on " + fast + ": not met yet. Inside the loop fast gains one step a round, so race again."}
    fast = nums[nums[fast]]; // @ask fast
  // @why Stop when they meet; that spot is somewhere inside the cycle.
  // @yes slow is on {slow}, fast on {fast}: not met yet. Inside the loop fast gains one step a round, so they will meet.
  // @no Both are on {slow}. That is somewhere inside the loop, not necessarily its entrance.
  } while (slow !== fast);

  // @why A second walker from the start; it meets `slow` at the cycle entrance.
  // @phase Phase 2: find where the loop begins
  // @say Start a second walker at index 0. The distance from 0 to the loop's entrance equals the distance from the meeting point {slow} forward to the entrance (going around the loop). So walking both one step at a time, they meet exactly at the entrance.
  let slow2 = 0; // @moment met inside the cycle at {slow}
  // @why Move both one step at a time until they meet.
  // @yes slow is on {slow}, the new walker on {slow2}. They haven't met, so the walker hasn't reached the entrance yet.
  // @no Both are on {slow}: the loop's entrance.
  while (slow !== slow2) {
    // @why Slow takes one step.
    // @say slow: {slow} → {nums[slow]}.
    slow = nums[slow];
    // @why The second walker takes one step.
    // @say Walker: {slow2} → {nums[slow2]}.
    slow2 = nums[slow2]; // @ask slow2
  }
  // @why The cycle entrance is the number that appears twice.
  // @phase Answer
  // @returns {slow}: the loop's entrance, the node two different indices point to, so {slow} appears twice. O(n) time, O(1) space, array untouched.
  return slow;
}

test("287. Find the Duplicate Number", () => {
  assert.equal(findDuplicate([1, 3, 4, 2, 2]), 2);
  assert.equal(findDuplicate([3, 1, 3, 4, 2]), 3);
  assert.equal(findDuplicate([3, 3, 3, 3, 3]), 3);
  assert.equal(findDuplicate([1, 1]), 1);
  assert.equal(findDuplicate([2, 5, 9, 6, 9, 3, 8, 9, 7, 1]), 9);
});
