/**
 * 152. Maximum Product Subarray
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/maximum-product-subarray/
 *
 * Given an integer array `nums`, find a non-empty contiguous subarray with
 * the largest product and return that product.
 *
 * Example 1:
 *   Input: nums = [2, 3, -2, 4]
 *   Output: 6   ([2, 3])
 *
 * Example 2:
 *   Input: nums = [-2, 0, -1]
 *   Output: 0
 *
 * Constraints:
 *   1 <= nums.length <= 2 * 10^4
 *   -10 <= nums[i] <= 10
 *   The product of any subarray fits in a 32-bit integer.
 *
 * Approach: Track running max and min product
 *   State: curMax / curMin = largest / smallest product of a subarray ending
 *   at index i. A negative number swaps their roles, so:
 *     curMax = max(n, n * prevMax, n * prevMin)
 *     curMin = min(n, n * prevMax, n * prevMin)
 *   The answer is the largest curMax seen.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: best-so-far
 * Key insight: A negative number turns the smallest product into the largest, so keep
 *   both the running max and the running min ending here. Each step only needs those two
 *   values, the current number and the best seen so far.
 * Real world: Finding the best run of compounding returns in a series of growth factors,
 *   where a negative factor can flip a loss into a gain.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz best:res
// @rule curMax and curMin are the biggest and smallest products of a run ending at n
// @why Returns the biggest product of any contiguous run of numbers.
export function maxProduct(nums: number[]): number {
  // @why `res` is the best product seen so far; start with the first number so all-negative input works.
  let res = nums[0];
  // @why `curMax` means the biggest product of a run ending at the current number.
  let curMax = 1;
  // @why `curMin` means the smallest (most negative) product ending here; a later negative can flip it into the biggest.
  let curMin = 1;
  // @why Each number either extends the previous run or starts a new run.
  for (const n of nums) {
    // @why Extending the biggest run ending before this number.
    const a = n * curMax;
    // @why Extending the smallest run; if `n` is negative this may become the biggest.
    const b = n * curMin;
    // @why Best run ending here: start fresh with `n`, or extend with the biggest or smallest product.
    curMax = Math.max(n, a, b); // @ask curMax
    // @why Worst run ending here, kept in case the next number is negative.
    curMin = Math.min(n, a, b);
    // @why Update the overall best with the best run ending at this number.
    res = Math.max(res, curMax);
  }
  // @why The best product over all runs.
  return res;
}

test("152. Maximum Product Subarray", () => {
  assert.equal(maxProduct([2, 3, -2, 4]), 6);
  assert.equal(maxProduct([-2, 0, -1]), 0);
  assert.equal(maxProduct([-2]), -2);
  assert.equal(maxProduct([-2, 3, -4]), 24);
});
