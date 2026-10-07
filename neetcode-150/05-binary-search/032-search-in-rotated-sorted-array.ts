/**
 * 33. Search in Rotated Sorted Array
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/search-in-rotated-sorted-array/
 *
 * An ascending array of distinct integers has possibly been rotated at an
 * unknown pivot. Given the rotated array `nums` and `target`, return the
 * index of `target`, or -1 if it is not present, in O(log n) time.
 *
 * Example 1:
 *   Input: nums = [4, 5, 6, 7, 0, 1, 2], target = 0
 *   Output: 4
 *
 * Example 2:
 *   Input: nums = [4, 5, 6, 7, 0, 1, 2], target = 3
 *   Output: -1
 *
 * Example 3:
 *   Input: nums = [1], target = 0
 *   Output: -1
 *
 * Constraints:
 *   1 <= nums.length <= 5000
 *   -10^4 <= nums[i], target <= 10^4
 *   All values are unique.
 *
 * Approach: Binary search on the sorted half
 *   At every step at least one of [lo, mid] or [mid, hi] is sorted. Check
 *   whether the target falls inside the sorted half's range; if so search
 *   there, otherwise search the other half.
 *
 * Time: O(log n)   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: Any midpoint splits the rotated array into at least one sorted half, and
 *   with a sorted half a range check says for sure whether the target is there, so half
 *   can still be discarded.
 * Real world: Searching a ring buffer of time-ordered records whose start point has
 *   rotated, without first unrotating it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz range:lo..hi@mid
// @rule lo..hi always contains the target if it is in the array
// @why Finds `target` in a rotated sorted array, returning its index or -1.
// @goal where is {target} in the rotated sorted array {JSON.stringify(nums)}?
export function search(nums: number[], target: number): number {
  // @why `lo` and `hi` bound the part still worth searching.
  // @phase Setup: the whole array is still in play
  // @say A scan is O(n), and plain binary search breaks because the array is not sorted end to end. But cut a rotated array anywhere and at least one side is fully sorted. A sorted side has known bounds, so you can always tell whether {target} is in it, and throw away half.
  let lo = 0;
  let hi = nums.length - 1;
  // @why Keep going while the range is not empty.
  // @phase Find the sorted half, then keep the half that can hold the target
  // @yes {lo === hi ? "Index " + lo + " is the last place " + target + " could be, so check it." : "Indices " + lo + ".." + hi + " could still hold " + target + ", so probe the middle."}
  // @no The range is empty: every index was ruled out, so {target} is not in the array.
  while (lo <= hi) {
    // @why Look at the middle.
    // @say Probe index {(lo + hi) >> 1}{lo === hi ? ", the only one left" : ", the middle of " + lo + ".." + hi}.
    const mid = (lo + hi) >> 1;
    // @why Lucky case: the middle is the target.
    // @yes nums[{mid}] is {target}.
    // @no {nums[mid]} is not {target}. Next, work out which side of {mid} is sorted.
    // @returns index {mid}.
    if (nums[mid] === target) return mid;

    // @why After rotating, at least one half is always sorted. Find out which one.
    // @say Compare the left end {nums[lo]} with the middle {nums[mid]}.
    // @yes {nums[lo]} ≤ {nums[mid]}: {lo === mid ? "" : "no drop between " + lo + " and " + mid + ", so "}the left half {lo === mid ? "(just index " + lo + ")" : "[" + lo + ".." + mid + "]"} is sorted and spans {nums[lo] === nums[mid] ? "only " + nums[lo] : nums[lo] + ".." + nums[mid]}.
    // @no {nums[lo]} > {nums[mid]}: the drop (the rotation point) is in the left half, so the right half [{mid}..{hi}] is the sorted one, spanning {nums[mid]}..{nums[hi]}.
    if (nums[lo] <= nums[mid]) { // @ask nums[lo]<=nums[mid]
      // Left half is sorted.
      // @why Left half is sorted, so we can tell if the target lies inside it; if so, go left.
      // @yes {nums[lo]} ≤ {target} < {nums[mid]}: {target} falls inside the sorted left half's range, so it can only be there. Search left.
      // @no {target} is outside {nums[lo] === nums[mid] ? nums[lo] : nums[lo] + ".." + nums[mid]}, the sorted left half's range, so it can't be there. Search the right half.
      // @then {nums[lo] <= target && target < nums[mid] ? lo <= hi ? "Search " + (lo === hi ? "index " + lo : "indices " + lo + ".." + hi) + "." : "Nothing is left to search." : ""}
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1; // @ask hi
      // @why Otherwise the target can only be in the right half.
      // @then {lo <= hi ? "Search " + (lo === hi ? "index " + lo : "indices " + lo + ".." + hi) + "." : "Nothing is left to search."}
      else lo = mid + 1;
    // @why Left half is not sorted, so the right half must be.
    } else {
      // Right half is sorted.
      // @why Right half is sorted, so check if the target lies inside it; if so, go right.
      // @yes {nums[mid]} < {target} ≤ {nums[hi]}: {target} falls inside the sorted right half's range, so search right.
      // @no {target} is outside {nums[mid]}..{nums[hi]}, the sorted right half's range, so it can only be in the left half.
      // @then {nums[mid] < target && target <= nums[hi] ? lo <= hi ? "Search " + (lo === hi ? "index " + lo : "indices " + lo + ".." + hi) + "." : "Nothing is left to search." : ""}
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1; // @ask lo
      // @why Otherwise the target can only be in the left half.
      // @then {lo <= hi ? "Search " + (lo === hi ? "index " + lo : "indices " + lo + ".." + hi) + "." : "Nothing is left to search."}
      else hi = mid - 1;
    }
  }
  // @why The range is empty and nothing matched.
  // @phase Answer
  // @returns -1: every index was ruled out, so {target} is not in the array.
  return -1;
}

test("33. Search in Rotated Sorted Array", () => {
  assert.equal(search([4, 5, 6, 7, 0, 1, 2], 0), 4);
  assert.equal(search([4, 5, 6, 7, 0, 1, 2], 3), -1);
  assert.equal(search([1], 0), -1);
  assert.equal(search([3, 1], 1), 1);
  assert.equal(search([5, 1, 3], 5), 0);
});
