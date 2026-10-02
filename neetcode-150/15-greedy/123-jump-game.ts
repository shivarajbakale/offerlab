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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canJump(nums: number[]): boolean {
  let goal = nums.length - 1;
  for (let i = nums.length - 2; i >= 0; i--) {
    if (i + nums[i] >= goal) goal = i;
  }
  return goal === 0;
}

test("55. Jump Game", () => {
  assert.equal(canJump([2, 3, 1, 1, 4]), true);
  assert.equal(canJump([3, 2, 1, 0, 4]), false);
  assert.equal(canJump([0]), true); // already at the end
  assert.equal(canJump([0, 1]), false);
});
