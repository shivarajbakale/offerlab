/**
 * 45. Jump Game II
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/jump-game-ii/
 *
 * You start at index 0 of an integer array `nums`, where nums[i] is the
 * maximum forward jump from index i. Return the minimum number of jumps
 * needed to reach the last index. The input guarantees it is reachable.
 *
 * Example 1:
 *   Input: nums = [2, 3, 1, 1, 4]
 *   Output: 2   (0 -> 1 -> 4)
 *
 * Example 2:
 *   Input: nums = [2, 3, 0, 1, 4]
 *   Output: 2
 *
 * Constraints:
 *   1 <= nums.length <= 10^4
 *   0 <= nums[i] <= 1000
 *   The last index is always reachable.
 *
 * Approach: Greedy BFS over "levels"
 *   The window [l, r] is every index reachable with the current number of
 *   jumps. Scan the window to find the farthest index reachable with one
 *   more jump; that becomes the next window [r + 1, farthest]. Count windows
 *   until r reaches the last index.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: greedy
 * Key insight: All indices reachable with k jumps form one contiguous window, so this is
 *   BFS by levels without a queue. The next window ends at the farthest point any index in
 *   the current window can reach.
 * Real world: A network planner counting the minimum number of relay hops along a line of
 *   towers, where each tower covers a known forward range.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function jump(nums: number[]): number {
  let jumps = 0;
  let l = 0;
  let r = 0;
  while (r < nums.length - 1) {
    let farthest = 0;
    for (let i = l; i <= r; i++) {
      farthest = Math.max(farthest, i + nums[i]);
    }
    l = r + 1;
    r = farthest;
    jumps++;
  }
  return jumps;
}

test("45. Jump Game II", () => {
  assert.equal(jump([2, 3, 1, 1, 4]), 2);
  assert.equal(jump([2, 3, 0, 1, 4]), 2);
  assert.equal(jump([0]), 0); // already at the end
  assert.equal(jump([1, 1, 1, 1]), 3);
});
