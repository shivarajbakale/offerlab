/**
 * 1899. Merge Triplets to Form Target Triplet
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/merge-triplets-to-form-target-triplet/
 *
 * You are given a list of triplets and a `target` triplet. An operation picks
 * two triplets i and j and replaces triplets[j] with the element-wise max of
 * the two. Return true if, after any number of operations, `target` can
 * appear as one of the triplets.
 *
 * Example 1:
 *   Input: triplets = [[2,5,3],[1,8,4],[1,7,5]], target = [2,7,5]
 *   Output: true   (merge [2,5,3] and [1,7,5])
 *
 * Example 2:
 *   Input: triplets = [[3,4,5],[4,5,6]], target = [3,2,5]
 *   Output: false
 *
 * Example 3:
 *   Input: triplets = [[2,5,3],[2,3,4],[1,2,5],[5,2,3]], target = [5,5,5]
 *   Output: true
 *
 * Constraints:
 *   1 <= triplets.length <= 10^5
 *   triplets[i].length == target.length == 3
 *   1 <= values <= 1000
 *
 * Approach: Greedy filter
 *   Max only grows, so any triplet with a value exceeding the target in some
 *   position can never be used. Among the remaining "safe" triplets, check
 *   whether each target position is matched exactly by at least one of them;
 *   merging all those safe triplets then yields the target.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: greedy
 * Key insight: Max never decreases, so any triplet with a value above the target can never
 *   be used. Among the safe ones, merging all of them never overshoots, so you only need
 *   each target position matched exactly by some safe triplet.
 * Real world: A config system that merges feature flags by taking the max level per
 *   setting, checking whether some subset of profiles produces exactly the desired
 *   configuration.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns true if merging some triplets (taking max per position) can make `target`.
export function mergeTriplets(triplets: number[][], target: number[]): boolean {
  // @why `found[i]` says whether some usable triplet already supplies target value in position `i`.
  const found = [false, false, false];
  // @why Look at each triplet.
  for (const t of triplets) {
    // @why Merging takes the max, so a triplet with any too-big number would ruin the result. Skip it.
    if (t[0] > target[0] || t[1] > target[1] || t[2] > target[2]) continue;
    // @why Check each of the three positions.
    for (let i = 0; i < 3; i++) {
      // @why This safe triplet gives the exact target value here.
      if (t[i] === target[i]) found[i] = true;
    }
  }
  // @why We need all three positions to be matched exactly.
  return found.every(Boolean);
}

test("1899. Merge Triplets to Form Target Triplet", () => {
  assert.equal(mergeTriplets([[2, 5, 3], [1, 8, 4], [1, 7, 5]], [2, 7, 5]), true);
  assert.equal(mergeTriplets([[3, 4, 5], [4, 5, 6]], [3, 2, 5]), false);
  assert.equal(
    mergeTriplets([[2, 5, 3], [2, 3, 4], [1, 2, 5], [5, 2, 3]], [5, 5, 5]),
    true,
  );
  assert.equal(mergeTriplets([[1, 2, 3]], [1, 2, 3]), true); // already present
});
