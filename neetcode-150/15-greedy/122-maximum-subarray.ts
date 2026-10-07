/**
 * 53. Maximum Subarray
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/maximum-subarray/
 *
 * Given an integer array `nums`, find the contiguous non-empty subarray with
 * the largest sum and return that sum.
 *
 * Example 1:
 *   Input: nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
 *   Output: 6   (subarray [4, -1, 2, 1])
 *
 * Example 2:
 *   Input: nums = [1]
 *   Output: 1
 *
 * Example 3:
 *   Input: nums = [5, 4, -1, 7, 8]
 *   Output: 23
 *
 * Constraints:
 *   1 <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 *
 * Approach: Kadane's algorithm
 *   Keep a running sum of the current subarray. If the running sum ever goes
 *   negative, it can only hurt whatever comes next, so drop it and start
 *   fresh at the next element. Track the best sum seen along the way.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: best-so-far
 * Key insight: A negative running sum can only lower whatever follows, so the best
 *   subarray ending here either extends the previous one or starts fresh at this element.
 *   One pass tracks that running sum and the best value seen.
 * Real world: Finding the stretch of days with the largest total profit in a P&L series,
 *   or the strongest signal burst in a noisy sensor trace.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz best:best
// @rule cur is the biggest sum of a slice ending at the current number
// @why Returns the biggest sum of any contiguous slice of `nums`.
// @goal what is the biggest sum of any unbroken slice of {JSON.stringify(nums)}?
export function maxSubArray(nums: number[]): number {
  // @why Start `best` at the first number so an all-negative array still gives the right answer.
  // @phase Setup: the best slice seen, and the slice still growing
  // @say Summing every slice is n² work. But the best slice ending at any number is either that number alone or the best slice ending just before it plus this number, so one running sum is enough. `best` starts at the first number, {nums[0]}, not 0, so an all-negative array still answers with its largest number.
  let best = nums[0];
  // @why `cur` is the sum of the slice we are currently extending.
  let cur = 0;
  // @why One pass: each number either extends the current slice or starts a new one.
  // @phase One pass: extend the running slice, or drop it and start fresh
  // @say Next number: {n}. The slice ending just before it sums to {cur}.
  for (const n of nums) {
    // @why A negative running sum would only drag the next numbers down, so throw it away.
    // @yes The slice so far sums to {cur}, below zero. Anything that starts with it would be bigger without it, so drop it and start fresh at {n}.
    // @no The slice so far sums to {cur}, which is not negative, so keeping it can only help {n}: extend it.
    if (cur < 0) cur = 0; // negative prefix never helps
    // @why Add this number to the slice that ends here.
    // @say Add {n}: {cur} + {n} = {cur + n}. That is the best sum of any slice ending exactly at {n}.
    cur += n; // @ask cur
    // @why Remember the best slice sum seen so far.
    // @say Best so far was {best}; the slice ending here sums to {cur}. {cur > best ? "New best." : "Not better, so best stays."}
    // @then Best slice sum found anywhere so far: {best}.
    best = Math.max(best, cur); // @ask best
  }
  // @why `best` is the answer after looking at every number.
  // @phase Answer
  // @returns {best}: every possible slice end was checked once, with its best start already folded in, so O(n) time and O(1) space.
  return best;
}

test("53. Maximum Subarray", () => {
  assert.equal(maxSubArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]), 6);
  assert.equal(maxSubArray([1]), 1);
  assert.equal(maxSubArray([5, 4, -1, 7, 8]), 23);
  assert.equal(maxSubArray([-3, -1, -2]), -1); // all negative
});
