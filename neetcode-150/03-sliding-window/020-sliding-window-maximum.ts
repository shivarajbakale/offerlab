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
export function maxSlidingWindow(nums: number[], k: number): number[] {
  // @why Queue of indices whose values go from big to small; the front is the window's max.
  const dq: number[] = []; // indices, values decreasing
  // @why Front of the queue; moving it is cheaper than shifting an array.
  let head = 0;
  // @why Max of each window, in order.
  const result: number[] = [];

  // @why Slide the window by moving the right edge across the array.
  for (let r = 0; r < nums.length; r++) {
    // @why Smaller numbers behind a bigger new one can never be the max again, so drop them.
    while (dq.length > head && nums[dq[dq.length - 1]] <= nums[r]) dq.pop(); // @broken
    // @why Add the new index at the back.
    dq.push(r); // @ask dq.length-head
    // @why The front index fell out of the window on the left, so drop it.
    if (dq[head] <= r - k) head++; // @ask head
    // @why Once the first full window exists, record its max.
    if (r >= k - 1) result.push(nums[dq[head]]);
  }
  // @why All the window maximums.
  return result;
}

test("239. Sliding Window Maximum", () => {
  assert.deepEqual(maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3), [3, 3, 5, 5, 6, 7]);
  assert.deepEqual(maxSlidingWindow([1], 1), [1]);
  assert.deepEqual(maxSlidingWindow([9, 8, 7, 6], 2), [9, 8, 7]);
  assert.deepEqual(maxSlidingWindow([1, -1], 2), [1]);
});
