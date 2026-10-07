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
// @rule with a fixed, any pair of the rest that sums to -a lies inside l..r
// @why Return every unique triplet that adds up to 0.
// @goal which unique triplets in {JSON.stringify(nums)} add up to 0?
export function threeSum(nums: number[]): number[][] {
  // @why Sort a copy so two pointers work and equal numbers sit together.
  // @phase Setup: sort so pairs can be squeezed and duplicates sit together
  // @say Trying every triple is n³ work, and de-duplicating them afterwards is messy. Sorting first (n log n) turns it into: fix one number, then find a pair for it with two pointers in O(n). Equal values also end up side by side, so repeats are easy to skip.
  const sorted = [...nums].sort((x, y) => x - y);
  // @why The triplets we find.
  const result: number[][] = [];

  // @why Fix one number `a`, then find two others that cancel it; two numbers must remain after it.
  // @phase Fix the first number, then squeeze for a pair that cancels it
  // @yes Fix index {i} ({sorted[i]}) as the smallest number of the triplet. At least two numbers remain after it to form a pair.
  // @no From index {i} on, fewer than three numbers remain, so no new triplet can start.
  for (let i = 0; i < sorted.length - 2; i++) {
    // @why The fixed first number of the triplet.
    // @say Fix a = {sorted[i]}. The other two must sum to exactly {-sorted[i]} to cancel it.
    const a = sorted[i];
    // @why Sorted, so everything ahead is positive and can't sum to 0.
    // @yes {a} is positive, and everything after it in sorted order is at least {a}. Three positives can't sum to 0, so stop entirely.
    // @no {a} is not positive, so a pair of later numbers could still cancel it.
    if (a > 0) break;
    // @why Skip a repeated first number so the same triplet isn't added twice.
    // @yes {a} was already the fixed number last round, and every triplet starting with it was found then. Fixing it again would only repeat them, so skip it.
    // @no {i === 0 ? "The first fixed number can't be a repeat." : a + " is new (the previous was " + sorted[i - 1] + "), so its triplets haven't been searched yet."}
    if (i > 0 && a === sorted[i - 1]) continue;

    // @why `l` starts just after `a`, at the small side.
    // @say Partners for {a} come only from after index {i}: any triplet using an earlier number was already found when that number was fixed.
    let l = i + 1;
    // @why `r` starts at the big side.
    let r = sorted.length - 1;
    // @why Search the rest of the array for a pair that makes the sum 0.
    // @yes {sorted[l]} (index {l}) and {sorted[r]} (index {r}) are still two different numbers to try with {a}.
    // @no The pointers met, so every pair for {a} has been tried.
    while (l < r) {
      // @why Total of the fixed number and the two pointer numbers.
      // @say {a} + {sorted[l]} + {sorted[r]} = {a + sorted[l] + sorted[r]}.
      const sum = a + sorted[l] + sorted[r];
      // @why Too big, so make it smaller by moving the right pointer left.
      // @yes {sum} is too big. Even with the smallest partner left, {sorted[l]}, {sorted[r]} overshoots, so it can't be in any triplet with {a}. Move r left to a smaller number.
      // @no {sum} is not too big, so {sorted[r]} stays.
      if (sum > 0) r--; // @ask r
      // @why Too small, so make it bigger by moving the left pointer right.
      // @yes {sum} is too small. Even with the largest partner left, {sorted[r]}, {sorted[l]} falls short, so drop it. Move l right to a larger number.
      // @no Neither too big nor too small: the sum is exactly 0, so this is a triplet.
      else if (sum < 0) l++; // @ask l
      // @why Sum is exactly 0, so we found a triplet.
      else {
        // @why Save the triplet.
        // @say {a} + {sorted[l]} + {sorted[r]} = 0, so record the triplet.
        result.push([a, sorted[l], sorted[r]]); // @moment found [{a},{sorted[l]},{sorted[r]}]
        // @why Move both pointers in to look for other pairs.
        // @say Both ends are used up: keeping either one would need the exact same partner, which only repeats this triplet. Move both inward.
        l++;
        r--;
        // @why Skip equal left values; they would give the same triplet again.
        // @yes {sorted[l]} at {l} equals the left value just used, so it would rebuild the same triplet. Skip it.
        // @no {l < r ? sorted[l] + " is a new left value, so the search can go on." : "The pointers met, so nothing is left to skip."}
        while (l < r && sorted[l] === sorted[l - 1]) l++;
      }
    }
  }
  // @why All unique triplets.
  // @phase Answer
  // @returns {result.length} unique {result.length === 1 ? "triplet" : "triplets"}: each fixed number got one O(n) squeeze, so O(n²) overall.
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
