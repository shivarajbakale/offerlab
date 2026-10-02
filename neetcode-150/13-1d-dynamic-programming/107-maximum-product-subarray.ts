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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxProduct(nums: number[]): number {
  let res = nums[0];
  let curMax = 1;
  let curMin = 1;
  for (const n of nums) {
    const a = n * curMax;
    const b = n * curMin;
    curMax = Math.max(n, a, b);
    curMin = Math.min(n, a, b);
    res = Math.max(res, curMax);
  }
  return res;
}

test("152. Maximum Product Subarray", () => {
  assert.equal(maxProduct([2, 3, -2, 4]), 6);
  assert.equal(maxProduct([-2, 0, -1]), 0);
  assert.equal(maxProduct([-2]), -2);
  assert.equal(maxProduct([-2, 3, -4]), 24);
});
