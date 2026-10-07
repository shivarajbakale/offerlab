/**
 * 55. Jump Game
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/jump-game/
 *
 * You start at index 0 of an integer array `nums`. Each element is the
 * maximum jump length from that position. Return true if you can reach the
 * last index, otherwise false.
 *
 * Example 1:
 *   Input: nums = [2, 3, 1, 1, 4]
 *   Output: true
 *
 * Example 2:
 *   Input: nums = [3, 2, 1, 0, 4]
 *   Output: false   (always land on index 3, whose jump length is 0)
 *
 * Constraints:
 *   1 <= nums.length <= 10^4
 *   0 <= nums[i] <= 10^5
 *
 * Approach: Greedy, moving the goal backwards
 *   Start with the goal at the last index. Walk right-to-left; if index i can
 *   reach the goal (i + nums[i] >= goal), then reaching i is good enough, so
 *   move the goal to i. At the end, we succeed if the goal reached index 0.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: greedy
 * Key insight: If index i can reach the goal, reaching i is as good as reaching the goal,
 *   so the goal can move back to i. Walking right to left, you only ever need the nearest
 *   index that works.
 * Real world: A route planner checking whether a vehicle with refuel stops of known range
 *   can reach the destination, by pulling the target back to the last stop that can reach
 *   it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz best:goal
// @rule goal is the leftmost index known to reach the last index
// @why Returns true if we can reach the last index starting from index 0.
// @goal can index 0 of {JSON.stringify(nums)} jump its way to the last index?
export function canJump(nums: number[]): boolean {
  // @why Work backwards: `goal` is the leftmost spot we know can reach the end. It starts at the last index.
  // @phase Setup: the last index trivially reaches itself
  // @say Trying every jump path from the start branches out exponentially. Instead walk backwards: an index can reach the end exactly when it can reach any index already known to reach the end, and the leftmost such index, `goal`, is the easiest one to hit. It starts at the last index, {nums.length - 1}.
  let goal = nums.length - 1;
  // @why Check each earlier index, moving from right to left.
  // @phase Walk backwards, pulling the goal toward the start
  // @yes Next is index {i} (jump up to {nums[i]}). Every index to its right has already been settled.
  // @no Every index has been checked; the goal stopped at {goal}.
  for (let i = nums.length - 2; i >= 0; i--) {
    // @why If this index can jump to `goal` or beyond, it can reach the end, so it becomes the new `goal`.
    // @yes From {i}, a jump of up to {nums[i]} reaches index {i + nums[i]}, at or past the goal {goal}. Reaching the goal means reaching the end, so {i} is the new goal.
    // @no From {i}, the farthest it reaches is {i + nums[i]}, short of the goal {goal}. Every spot it can land on lies before the goal and is already known to be stuck, so {i} is stuck too.
    if (i + nums[i] >= goal) goal = i; // @ask goal
  }
  // @why If `goal` moved all the way back to index 0, the start can reach the end.
  // @phase Answer
  // @returns {goal === 0 ? "true: the goal was pulled all the way back to index 0, so the start reaches the end." : "false: the leftmost index that reaches the end is " + goal + ", and nothing before it can jump that far."}
  return goal === 0;
}

test("55. Jump Game", () => {
  assert.equal(canJump([2, 3, 1, 1, 4]), true);
  assert.equal(canJump([3, 2, 1, 0, 4]), false);
  assert.equal(canJump([0]), true); // already at the end
  assert.equal(canJump([0, 1]), false);
});
