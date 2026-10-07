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
 *
 * Pattern: prefix-sum
 * Key insight: The product of everything except i is just (product of all to the left)
 *   times (product of all to the right); both are running products, so two passes replace
 *   division and the O(n^2) rescan.
 * Real world: Leave-one-out scoring in analytics, where each item's contribution is
 *   measured by combining precomputed prefix and suffix aggregates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule prefix is the product of every number left of i; suffix of every number right of i
// @why Return, for each spot, the product of all the other numbers.
// @goal for each spot in {JSON.stringify(nums)}, what is the product of all the other numbers?
export function productExceptSelf(nums: number[]): number[] {
  // @why Remember the array size.
  // @phase Setup
  // @say The easy way is to multiply everything and divide by nums[i], but division is not allowed and breaks on 0. Instead: everything except nums[i] is (all to its left) × (all to its right).
  const n = nums.length;
  // @why Output array; first it holds the product of everything to the left.
  const answer = new Array<number>(n).fill(1);
  // @why Running product of the numbers to the left of `i`.
  // @phase Pass 1, left to right: each spot gets the product of everything to its left
  // @say Nothing is left of index 0, and the product of nothing is 1, so start at 1.
  let prefix = 1;
  // @why Left to right pass fills each spot with its left-side product.
  // @yes Index {i}: prefix = {prefix}, the product of {i === 0 ? "nothing yet" : JSON.stringify(nums.slice(0, i))}.
  // @no Every spot now holds its left-side product: {JSON.stringify(answer)}.
  for (let i = 0; i < n; i++) {
    // @why Save the product of everything left of `i` before counting `nums[i]`.
    // @say Store prefix = {prefix} before multiplying in nums[{i}] = {nums[i]}, because index {i} must not include itself.
    answer[i] = prefix; // @ask answer[i]
    // @why Now include `nums[i]` for the next spot.
    // @say Now fold in nums[{i}] = {nums[i]}, so prefix is ready for index {i + 1}: {prefix} × {nums[i]} = {prefix * nums[i]}.
    prefix *= nums[i];
  }
  // @why Running product of the numbers to the right of `i`.
  // @phase Pass 2, right to left: multiply in the product of everything to the right
  // @say Reuse `answer` instead of a second array. Nothing is right of the last index, so suffix starts at 1.
  let suffix = 1;
  // @why Right to left pass adds the right-side product, with no extra array.
  // @yes Index {i}: answer[{i}] = {answer[i]} holds the left side; suffix = {suffix} is the product of {i === n - 1 ? "nothing yet" : JSON.stringify(nums.slice(i + 1))}.
  // @no Every spot has both sides multiplied in.
  for (let i = n - 1; i >= 0; i--) {
    // @why Left product times right product is everything except `nums[i]`.
    // @say Left × right = {answer[i]} × {suffix} = {answer[i] * suffix}: the product of every number except nums[{i}] = {nums[i]}.
    answer[i] *= suffix; // @ask answer[i]
    // @why Now include `nums[i]` for the spot to its left.
    // @say Fold nums[{i}] = {nums[i]} into suffix for the spot to its left: {suffix} × {nums[i]} = {suffix * nums[i]}.
    suffix *= nums[i];
  }
  // Normalize -0 to 0 (JS quirk when multiplying 0 by a negative).
  // @why Add 0 to turn JS's -0 into plain 0, so results compare equal.
  // @returns {JSON.stringify(answer.map((x) => x + 0))}, in two passes and O(1) extra space besides the output.
  return answer.map((x) => x + 0);
}

test("238. Product of Array Except Self", () => {
  assert.deepEqual(productExceptSelf([1, 2, 3, 4]), [24, 12, 8, 6]);
  assert.deepEqual(productExceptSelf([-1, 1, 0, -3, 3]), [0, 0, 9, 0, 0]);
  assert.deepEqual(productExceptSelf([0, 0]), [0, 0]);
  assert.deepEqual(productExceptSelf([2, 3]), [3, 2]);
});
