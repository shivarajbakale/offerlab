/**
 * 704. Binary Search
 * Difficulty: Easy
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/binary-search/
 *
 * Given an array of integers `nums` sorted in ascending order and an integer
 * `target`, return the index of `target` in `nums`, or -1 if it is absent.
 * The algorithm must run in O(log n) time.
 *
 * Example 1:
 *   Input: nums = [-1, 0, 3, 5, 9, 12], target = 9
 *   Output: 4
 *
 * Example 2:
 *   Input: nums = [-1, 0, 3, 5, 9, 12], target = 2
 *   Output: -1
 *
 * Constraints:
 *   1 <= nums.length <= 10^4
 *   -10^4 < nums[i], target < 10^4
 *   All integers in nums are unique and sorted ascending.
 *
 * Approach: Classic binary search
 *   Keep a closed window [lo, hi]. Compare the middle element with the
 *   target and discard the half that cannot contain it.
 *
 * Time: O(log n)   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: Because the array is sorted, one comparison with the middle tells which
 *   half cannot contain the target, so half the remaining range is discarded each step.
 * Real world: Database B-tree indexes and sorted SSTable files binary search their keys
 *   to locate a row in O(log n).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz range:lo..hi@mid
// @rule lo..hi always contains the target if it is in the array
// @why Returns the index of `target` in the sorted array, or -1.
// @goal where is {target} in the sorted array {JSON.stringify(nums)}?
export function search(nums: number[], target: number): number {
  // @why `lo` and `hi` bound the part of the array where the target could still be.
  // @phase Setup: the whole array is still in play
  // @say Scanning left to right checks up to {nums.length} values. The array is sorted, so one comparison with the middle rules out a whole half, and each probe halves what is left: about log2(n) probes.
  let lo = 0;
  // @say The search range starts as all of it: indices {lo} to {nums.length - 1}.
  let hi = nums.length - 1;
  // @why Keep going while at least one position is left to check.
  // @phase Halve the range until the target is found or nothing is left
  // @yes Indices {lo}..{hi} ({hi - lo + 1} {hi - lo + 1 === 1 ? "value" : "values"}) could still hold {target}, so probe again.
  // @no The range is empty (lo {lo} passed hi {hi}). Every index was ruled out by some comparison, so {target} is not in the array.
  while (lo <= hi) {
    // @why Look at the middle so each step throws away half of the range.
    // @say Probe the middle of [{lo}, {hi}]. Whichever way the comparison goes, about half of the range is discarded.
    const mid = lo + ((hi - lo) >> 1);
    // @why Found it, so return its index.
    // @say Compare the middle value {nums[mid]} with {target}.
    // @yes nums[{mid}] is exactly {target}.
    // @no {nums[mid]} is not {target}, but it still tells you which side {target} must be on.
    // @returns index {mid}, found after discarding half the range at every probe.
    if (nums[mid] === target) return mid; // @moment probe {nums[mid]}
    // @why Sorted array: a too-small middle means the target can only be to the right, otherwise to the left.
    // @yes {nums[mid]} < {target}. The array is sorted, so everything at or left of index {mid} is at most {nums[mid]}, too small as well. Move lo past {mid}.
    // @no {nums[mid]} > {target}. Everything at or right of index {mid} is at least {nums[mid]}, too big as well. Move hi below {mid}.
    // @then {nums[mid] < target ? (lo <= hi ? target + " can only be at " + (lo === hi ? "index " + lo : "indices " + lo + ".." + hi) + "." : "Nothing is left where " + target + " could be.") : ""}
    if (nums[mid] < target) lo = mid + 1; // @ask lo
    // @then {lo <= hi ? target + " can only be at " + (lo === hi ? "index " + lo : "indices " + lo + ".." + hi) + "." : "Nothing is left where " + target + " could be."}
    else hi = mid - 1; // @ask hi
  }
  // @why The range is empty, so the target is not there.
  // @phase Answer
  // @returns -1: every index was ruled out, so {target} is not in the array.
  return -1;
}

test("704. Binary Search", () => {
  assert.equal(search([-1, 0, 3, 5, 9, 12], 9), 4);
  assert.equal(search([-1, 0, 3, 5, 9, 12], 2), -1);
  assert.equal(search([5], 5), 0);
  assert.equal(search([5], -5), -1);
});
