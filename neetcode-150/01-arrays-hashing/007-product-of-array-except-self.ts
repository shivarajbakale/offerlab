/**
 * 238. Product of Array Except Self
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/product-of-array-except-self/
 *
 * Given an integer array `nums`, return an array `answer` where `answer[i]`
 * is the product of every element of `nums` except `nums[i]`. Solve it in
 * O(n) time without using division.
 *
 * Example 1:
 *   Input: nums = [1, 2, 3, 4]
 *   Output: [24, 12, 8, 6]
 *
 * Example 2:
 *   Input: nums = [-1, 1, 0, -3, 3]
 *   Output: [0, 0, 9, 0, 0]
 *
 * Constraints:
 *   2 <= nums.length <= 10^5
 *   -30 <= nums[i] <= 30
 *   Every prefix/suffix product fits in a 32-bit integer.
 *
 * Approach: Prefix and suffix products
 *   First pass fills answer[i] with the product of everything left of i.
 *   Second pass (right to left) multiplies in a running product of
 *   everything right of i.
 *
 * Time: O(n)   Space: O(1) extra (output array not counted)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function productExceptSelf(nums: number[]): number[] {
  const n = nums.length;
  const answer = new Array<number>(n).fill(1);
  let prefix = 1;
  for (let i = 0; i < n; i++) {
    answer[i] = prefix;
    prefix *= nums[i];
  }
  let suffix = 1;
  for (let i = n - 1; i >= 0; i--) {
    answer[i] *= suffix;
    suffix *= nums[i];
  }
  // Normalize -0 to 0 (JS quirk when multiplying 0 by a negative).
  return answer.map((x) => x + 0);
}

test("238. Product of Array Except Self", () => {
  assert.deepEqual(productExceptSelf([1, 2, 3, 4]), [24, 12, 8, 6]);
  assert.deepEqual(productExceptSelf([-1, 1, 0, -3, 3]), [0, 0, 9, 0, 0]);
  assert.deepEqual(productExceptSelf([0, 0]), [0, 0]);
  assert.deepEqual(productExceptSelf([2, 3]), [3, 2]);
});
