/**
 * 15. 3Sum
 * Difficulty: Medium
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/3sum/
 *
 * Given an integer array `nums`, return all unique triplets
 * [nums[i], nums[j], nums[k]] with distinct indices i, j, k such that
 * nums[i] + nums[j] + nums[k] == 0. The result must not contain duplicate
 * triplets; order of triplets and of values within them does not matter.
 *
 * Example 1:
 *   Input: nums = [-1, 0, 1, 2, -1, -4]
 *   Output: [[-1, -1, 2], [-1, 0, 1]]
 *
 * Example 2:
 *   Input: nums = [0, 1, 1]
 *   Output: []
 *
 * Example 3:
 *   Input: nums = [0, 0, 0]
 *   Output: [[0, 0, 0]]
 *
 * Constraints:
 *   3 <= nums.length <= 3000
 *   -10^5 <= nums[i] <= 10^5
 *
 * Approach: Sort + two pointers
 *   Sort the array. Fix each element a (skipping repeats of a), then run
 *   Two Sum II on the rest for target -a. After finding a triplet, advance
 *   the left pointer past duplicates to avoid repeated triplets.
 *
 * Time: O(n^2)   Space: O(1) extra (ignoring sort / output)
 *
 * Pattern: two-pointers
 * Key insight: Sorting turns the problem into n runs of Two Sum II, and also places equal
 *   values next to each other, so duplicate triplets are skipped by comparing with the
 *   neighbor.
 * Real world: Finding three ledger entries that net to zero in a sorted transaction list
 *   during an audit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz array:sorted hide:a
// @why Return every unique triplet that adds up to 0.
export function threeSum(nums: number[]): number[][] {
  // @why Sort a copy so two pointers work and equal numbers sit together.
  const sorted = [...nums].sort((x, y) => x - y);
  // @why The triplets we find.
  const result: number[][] = [];

  // @why Fix one number `a`, then find two others that cancel it; two numbers must remain after it.
  for (let i = 0; i < sorted.length - 2; i++) {
    // @why The fixed first number of the triplet.
    const a = sorted[i];
    // @why Sorted, so everything ahead is positive and can't sum to 0.
    if (a > 0) break; // @say Sorted: once the fixed number is positive, no triplet can sum to 0
    // @why Skip a repeated first number so the same triplet isn't added twice.
    if (i > 0 && a === sorted[i - 1]) continue; // @say Same fixed value as last time would repeat triplets, so skip it

    // @why `l` starts just after `a`, at the small side.
    let l = i + 1;
    // @why `r` starts at the big side.
    let r = sorted.length - 1;
    // @why Search the rest of the array for a pair that makes the sum 0.
    while (l < r) {
      // @why Total of the fixed number and the two pointer numbers.
      const sum = a + sorted[l] + sorted[r];
      // @why Too big, so make it smaller by moving the right pointer left.
      if (sum > 0) r--; // @say Fixing {sorted[i]}; sum too big means move r left to a smaller number
      // @why Too small, so make it bigger by moving the left pointer right.
      else if (sum < 0) l++; // @say Sum too small, so move l right to a larger number
      // @why Sum is exactly 0, so we found a triplet.
      else {
        // @why Save the triplet.
        result.push([a, sorted[l], sorted[r]]); // @say {a} + {sorted[l]} + {sorted[r]} = 0, record the triplet
        // @why Move both pointers in to look for other pairs.
        l++;
        r--;
        // @why Skip equal left values; they would give the same triplet again.
        while (l < r && sorted[l] === sorted[l - 1]) l++; // @say Skip repeated left values so the same triplet isn't added twice
      }
    }
  }
  // @why All unique triplets.
  return result;
}

function normalize(triplets: number[][]): number[][] {
  return triplets
    .map((t) => [...t].sort((x, y) => x - y))
    .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
}

test("15. 3Sum", () => {
  assert.deepEqual(
    normalize(threeSum([-1, 0, 1, 2, -1, -4])),
    [[-1, -1, 2], [-1, 0, 1]],
  );
  assert.deepEqual(threeSum([0, 1, 1]), []);
  assert.deepEqual(threeSum([0, 0, 0]), [[0, 0, 0]]);
  assert.deepEqual(
    normalize(threeSum([-2, 0, 0, 2, 2])),
    [[-2, 0, 2]],
  );
});
