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
export function threeSum(nums: number[]): number[][] {
  const sorted = [...nums].sort((x, y) => x - y);
  const result: number[][] = [];

  for (let i = 0; i < sorted.length - 2; i++) {
    const a = sorted[i];
    if (a > 0) break; // @say Sorted: once the fixed number is positive, no triplet can sum to 0
    if (i > 0 && a === sorted[i - 1]) continue; // @say Same fixed value as last time would repeat triplets, so skip it

    let l = i + 1;
    let r = sorted.length - 1;
    while (l < r) {
      const sum = a + sorted[l] + sorted[r];
      if (sum > 0) r--; // @say Fixing {sorted[i]}; sum too big means move r left to a smaller number
      else if (sum < 0) l++; // @say Sum too small, so move l right to a larger number
      else {
        result.push([a, sorted[l], sorted[r]]); // @say {a} + {sorted[l]} + {sorted[r]} = 0, record the triplet
        l++;
        r--;
        while (l < r && sorted[l] === sorted[l - 1]) l++; // @say Skip repeated left values so the same triplet isn't added twice
      }
    }
  }
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
