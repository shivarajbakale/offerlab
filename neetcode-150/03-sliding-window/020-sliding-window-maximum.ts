/**
 * 239. Sliding Window Maximum
 * Difficulty: Hard
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/sliding-window-maximum/
 *
 * Given an integer array `nums` and a window size `k` that slides from left
 * to right one position at a time, return an array of the maximum value in
 * each window.
 *
 * Example 1:
 *   Input: nums = [1, 3, -1, -3, 5, 3, 6, 7], k = 3
 *   Output: [3, 3, 5, 5, 6, 7]
 *
 * Example 2:
 *   Input: nums = [1], k = 1
 *   Output: [1]
 *
 * Constraints:
 *   1 <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 *   1 <= k <= nums.length
 *
 * Approach: Monotonic decreasing deque of indices
 *   Before pushing index r, pop indices from the back whose values are <=
 *   nums[r] (they can never be a max again). Drop the front if it slid out of
 *   the window. The front is always the current window's maximum.
 *   (An array plus a head pointer acts as an O(1) deque here.)
 *
 * Time: O(n)   Space: O(k)
 *
 * Pattern: sliding-window,monotonic-stack
 * Key insight: A value that is smaller than a newer value can never be the max of any
 *   later window, so it is dropped; the deque stays decreasing and its front is always
 *   the current maximum.
 * Real world: Monitoring systems computing the rolling peak CPU usage over the last k
 *   samples for alerting, in O(1) amortized per sample.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dq holds window indices with values falling front to back; the front is the max
// @why Return the biggest number in each window of size `k`.
// @goal what is the largest number in each window of {k} in {JSON.stringify(nums)}?
export function maxSlidingWindow(nums: number[], k: number): number[] {
  // @why Queue of indices whose values go from big to small; the front is the window's max.
  // @phase Setup: a queue of max candidates
  // @say Rescanning each window is n·k work, and a heap costs log n per step. Instead keep only the numbers that could still become a window's max, in falling order: then the max is always at the front.
  const dq: number[] = []; // indices, values decreasing
  // @why Front of the queue; moving it is cheaper than shifting an array.
  let head = 0;
  // @why Max of each window, in order.
  const result: number[] = [];

  // @why Slide the window by moving the right edge across the array.
  // @phase Slide: add the new number, drop dead candidates, read the front
  // @yes {nums[r]} at index {r} enters the window.
  // @no Every number has entered once, so every window's max is recorded.
  for (let r = 0; r < nums.length; r++) {
    // @why Smaller numbers behind a bigger new one can never be the max again, so drop them.
    // @yes {nums[dq[dq.length - 1]]} at the back is ≤ the new {nums[r]}, and it will leave the window first. While both are in, {nums[r]} is at least as big, so {nums[dq[dq.length - 1]]} can never be a max again. Drop it.
    // @no {dq.length > head ? "The back of the queue, " + nums[dq[dq.length - 1]] + ", is bigger than " + nums[r] + ", so the new number can't knock it out. Keep it, and " + nums[r] + " joins behind it" : "The queue is empty, so nothing to compare"}.
    while (dq.length > head && nums[dq[dq.length - 1]] <= nums[r]) dq.pop(); // @broken
    // @why Add the new index at the back.
    // @say Add {nums[r]} at the back. It might be the max of a later window once the bigger numbers ahead of it slide out.
    // @then Candidates, front to back: {JSON.stringify(dq.slice(head).map((i) => nums[i]))}.
    dq.push(r); // @ask dq.length-head
    // @why The front index fell out of the window on the left, so drop it.
    // @yes The front candidate (index {dq[head]}) is at or before {r - k}, outside the window {r - k + 1}..{r}. It can't be this window's max, so drop it from the front.
    // @no The front candidate, {nums[dq[head]]} at index {dq[head]}, is still inside the window.
    if (dq[head] <= r - k) head++; // @ask head
    // @why Once the first full window exists, record its max.
    // @yes Window {r - k + 1}..{r} is full. Its max is the front of the queue: {nums[dq[head]]}.
    // @no Only {r + 1} of the first {k} numbers {r === 0 ? "is" : "are"} in, so there is no full window yet.
    if (r >= k - 1) result.push(nums[dq[head]]);
  }
  // @why All the window maximums.
  // @phase Answer
  // @returns {JSON.stringify(result)}: one max per window. Each index joined and left the queue at most once, so O(n).
  return result;
}

test("239. Sliding Window Maximum", () => {
  assert.deepEqual(maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3), [3, 3, 5, 5, 6, 7]);
  assert.deepEqual(maxSlidingWindow([1], 1), [1]);
  assert.deepEqual(maxSlidingWindow([9, 8, 7, 6], 2), [9, 8, 7]);
  assert.deepEqual(maxSlidingWindow([1, -1], 2), [1]);
});
