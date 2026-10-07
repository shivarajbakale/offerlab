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

// @rule l..r are exactly the indexes first reachable with jumps jumps
// @why Returns the fewest jumps needed to reach the last index.
// @goal what is the fewest number of jumps from index 0 to the last index of {JSON.stringify(nums)}?
export function jump(nums: number[]): number {
  // @why Count of jumps taken so far.
  // @phase Setup: zero jumps reach only index 0
  // @say Trying every jump sequence explodes, and even a BFS over single indexes repeats work. Instead treat each jump count as a window of indexes: everything reachable with 0 jumps is just index 0, and the next window is everything one jump from the current one.
  let jumps = 0;
  // @why `l` and `r` mark the range of indexes reachable with exactly `jumps` jumps, like one level of BFS.
  let l = 0;
  let r = 0;
  // @why Keep going until the current range already covers the last index.
  // @phase Grow the window one jump at a time
  // @yes Indexes {l}..{r} are what {jumps} {jumps === 1 ? "jump reaches" : "jumps reach"}, and the last index {nums.length - 1} is not among them, so one more jump is needed.
  // @no The window {l}..{r} covers the last index {nums.length - 1}, so {jumps} {jumps === 1 ? "jump is" : "jumps are"} enough, and no fewer could be, since earlier windows missed it.
  while (r < nums.length - 1) {
    // @why `farthest` is how far we could get with one more jump from anywhere in the range.
    // @say Scan the window {l}..{r} for the longest reach of one more jump.
    let farthest = 0;
    // @why Look at every index in the current range.
    // @yes Index {i} is in the current window, so a jump from it counts as jump number {jumps + 1}.
    // @no Every index in {l}..{r} has been tried; one more jump reaches up to {farthest}.
    for (let i = l; i <= r; i++) {
      // @why Track the furthest index any of them can reach.
      // @say From {i}, a jump of up to {nums[i]} reaches {i + nums[i]}. Farthest so far: {farthest}. {i + nums[i] > farthest ? "New farthest." : "No farther."}
      farthest = Math.max(farthest, i + nums[i]); // @ask farthest
    }
    // @why The next range starts just after the current one.
    // @say The new window starts at {r + 1}: everything up to {r} was already reachable with fewer jumps, so it never needs counting again.
    l = r + 1;
    // @why The next range ends at the furthest spot we found.
    // @say It ends at {farthest}, the farthest any index in the old window can land. Every index in between is reachable too, because a jump can stop short.
    r = farthest;
    // @why We spent one more jump to reach this new range.
    // @then {jumps} {jumps === 1 ? "jump reaches" : "jumps reach"} indexes {l}..{r}.
    jumps++; // @moment jump {jumps+1} reaches {farthest}
  }
  // @why `jumps` is the smallest number of jumps to reach the end.
  // @phase Answer
  // @returns {jumps}: the first window that covered the last index. Each index sat in exactly one window, so O(n) time and O(1) space.
  return jumps;
}

test("45. Jump Game II", () => {
  assert.equal(jump([2, 3, 1, 1, 4]), 2);
  assert.equal(jump([2, 3, 0, 1, 4]), 2);
  assert.equal(jump([0]), 0); // already at the end
  assert.equal(jump([1, 1, 1, 1]), 3);
});
