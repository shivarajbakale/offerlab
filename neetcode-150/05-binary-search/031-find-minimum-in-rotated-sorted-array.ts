/**
 * 153. Find Minimum in Rotated Sorted Array
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/
 *
 * An array of unique integers sorted ascending has been rotated between 1 and
 * n times (e.g. [0,1,2,4,5,6,7] -> [4,5,6,7,0,1,2]). Return its minimum
 * element in O(log n) time.
 *
 * Example 1:
 *   Input: nums = [3, 4, 5, 1, 2]
 *   Output: 1
 *
 * Example 2:
 *   Input: nums = [4, 5, 6, 7, 0, 1, 2]
 *   Output: 0
 *
 * Example 3:
 *   Input: nums = [11, 13, 15, 17]
 *   Output: 11
 *
 * Constraints:
 *   1 <= nums.length <= 5000
 *   -5000 <= nums[i] <= 5000
 *   All integers are unique; nums is a rotated sorted array.
 *
 * Approach: Binary search against the right edge
 *   If nums[mid] > nums[hi], the drop (minimum) is strictly right of mid;
 *   otherwise mid..hi is sorted, so the minimum is at mid or to its left.
 *   Shrink until lo === hi.
 *
 * Time: O(log n)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findMin(nums: number[]): number {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] > nums[hi]) lo = mid + 1;
    else hi = mid;
  }
  return nums[lo];
}

test("153. Find Minimum in Rotated Sorted Array", () => {
  assert.equal(findMin([3, 4, 5, 1, 2]), 1);
  assert.equal(findMin([4, 5, 6, 7, 0, 1, 2]), 0);
  assert.equal(findMin([11, 13, 15, 17]), 11);
  assert.equal(findMin([1]), 1);
  assert.equal(findMin([2, 1]), 1);
});
