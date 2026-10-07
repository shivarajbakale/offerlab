/**
 * 167. Two Sum II - Input Array Is Sorted
 * Difficulty: Medium
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
 *
 * Given a 1-indexed array `numbers` sorted in non-decreasing order, find two
 * numbers that add up to `target` and return their indices [index1, index2]
 * (1-indexed, index1 < index2). Exactly one solution exists, the same element
 * may not be used twice, and only constant extra space may be used.
 *
 * Example 1:
 *   Input: numbers = [2, 7, 11, 15], target = 9
 *   Output: [1, 2]
 *
 * Example 2:
 *   Input: numbers = [2, 3, 4], target = 6
 *   Output: [1, 3]
 *
 * Example 3:
 *   Input: numbers = [-1, 0], target = -1
 *   Output: [1, 2]
 *
 * Constraints:
 *   2 <= numbers.length <= 3 * 10^4
 *   -1000 <= numbers[i], target <= 1000
 *   Exactly one valid answer exists.
 *
 * Approach: Two pointers from both ends
 *   If the sum is too large, move the right pointer left; if too small, move
 *   the left pointer right. Sortedness guarantees we never skip the answer.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: two-pointers
 * Key insight: In a sorted array, if the sum is too big the right element cannot pair
 *   with anything at or after l, so it can be discarded; each step removes one candidate
 *   for good.
 * Real world: Matching two sorted price lists to find an item pair that exactly fits a
 *   gift card balance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule if a pair adds up to target, both of its numbers are inside l..r
// @why Return the 1-based positions of two numbers adding to `target`.
// @goal which two numbers in the sorted {JSON.stringify(numbers)} add up to {target}?
export function twoSum(numbers: number[], target: number): number[] {
  // @why `l` starts at the smallest number.
  // @phase Setup: pointers at the smallest and largest numbers
  // @say Checking every pair is n² work, and a hash map costs O(n) space. Because the array is sorted, one sum at the two ends tells you which end can never be part of the answer, so drop that end.
  let l = 0;
  // @why `r` starts at the largest number.
  let r = numbers.length - 1;
  // @why Keep going while there are two different numbers to compare.
  // @phase Squeeze: each sum rules out one end
  // @yes {numbers[l]} (position {l + 1}) and {numbers[r]} (position {r + 1}) are still two different numbers, so test them as a pair.
  // @no The pointers met, so no pair is left. The problem promises a pair, so this only happens on bad input.
  while (l < r) {
    // @why Add the smallest and largest numbers still in play.
    // @say Try the smallest and largest still in play: {numbers[l]} + {numbers[r]} = {numbers[l] + numbers[r]}, against target {target}.
    const sum = numbers[l] + numbers[r];
    // @why Found it; add 1 because positions start at 1.
    // @yes {numbers[l]} + {numbers[r]} = {target} exactly. Every pair ruled out earlier was provably wrong, so this is the one.
    // @no {sum} is not {target}, so one of the two ends must go. The sign of the miss says which.
    // @returns positions {l + 1} and {r + 1}: the problem counts positions from 1, not 0.
    if (sum === target) return [l + 1, r + 1];
    // @why Too big, and the array is sorted, so use a smaller right number.
    // @yes {sum} is too big. Even the smallest partner left, {numbers[l]}, overshoots with {numbers[r]}, so {numbers[r]} pairs with nothing here. Drop it.
    // @no {sum} is too small. Even the largest partner left, {numbers[r]}, is not enough for {numbers[l]}, so {numbers[l]} pairs with nothing here. Drop it.
    // @then {sum > target ? "The answer pair still lies within positions " + (l + 1) + ".." + (r + 1) + "." : ""}
    if (sum > target) r--; // @ask r
    // @why Too small, so use a bigger left number.
    // @say Step past {numbers[l]} to the next larger number.
    // @then The answer pair still lies within positions {l + 1}..{r + 1}.
    else l++; // @ask l
  }
  // @why Just a safe default; the problem promises an answer exists.
  // @returns an empty list. Only reached on input with no valid pair, which the problem rules out.
  return [];
}

test("167. Two Sum II - Input Array Is Sorted", () => {
  assert.deepEqual(twoSum([2, 7, 11, 15], 9), [1, 2]);
  assert.deepEqual(twoSum([2, 3, 4], 6), [1, 3]);
  assert.deepEqual(twoSum([-1, 0], -1), [1, 2]);
  assert.deepEqual(twoSum([1, 2, 3, 4, 4, 9], 8), [4, 5]);
});
