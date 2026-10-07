/**
 * 128. Longest Consecutive Sequence
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/longest-consecutive-sequence/
 *
 * Given an unsorted integer array `nums`, return the length of the longest
 * run of consecutive integers (e.g. 1, 2, 3, 4) that can be formed from its
 * elements. The algorithm must run in O(n) time.
 *
 * Example 1:
 *   Input: nums = [100, 4, 200, 1, 3, 2]
 *   Output: 4   (1, 2, 3, 4)
 *
 * Example 2:
 *   Input: nums = [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]
 *   Output: 9
 *
 * Constraints:
 *   0 <= nums.length <= 10^5
 *   -10^9 <= nums[i] <= 10^9
 *
 * Approach: Hash set, start only at sequence beginnings
 *   Put all numbers in a set. A number n starts a sequence only if n - 1 is
 *   absent. From each start, count upward while n + 1 exists. Each number is
 *   visited a constant number of times overall.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: hashing
 * Key insight: Only numbers whose predecessor n - 1 is missing can start a run, so
 *   counting up from those alone touches each number a constant number of times and
 *   avoids sorting.
 * Real world: Finding the longest streak of consecutive login days for a user from an
 *   unordered set of activity dates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz best:best
// @rule a run is only counted from its first number, the one with no n-1 in the set
// @why Return the length of the longest run of numbers like 4,5,6,7.
// @goal what is the longest run of consecutive numbers in {JSON.stringify(nums)}?
export function longestConsecutive(nums: number[]): number {
  // @why A set gives instant lookups and removes duplicates; no sorting needed.
  // @phase Setup: put every number in a set
  // @say Sorting would line up runs but costs n log n. A set answers "is x here?" in O(1), which is all a run needs: does the next number exist?
  const set = new Set(nums);
  // @why Longest run found so far.
  let best = 0;
  // @why Look at each distinct number as a possible start of a run.
  // @phase Try each number as the start of a run
  // @say Candidate: {n}.
  for (const n of set) {
    // @why `n` is in the middle of a run, so skip it; only start counting at a run's first number.
    // @yes {n - 1} is in the set, so {n} is in the middle of a run. Counting from here would redo work the run's real start will do, so skip.
    // @no {n - 1} is not in the set, so {n} starts a run. Only starts get counted, which keeps the total work O(n).
    if (set.has(n - 1)) continue;
    // @why The run so far is just `n` itself.
    let len = 1; // @moment run starts at {n}
    // @why Keep extending while the next number exists.
    // @yes {n + len} is in the set, so the run {n}..{n + len} keeps going.
    // @no {n + len} is missing, so the run from {n} stops at length {len}.
    while (set.has(n + len)) len++;
    // @why Keep the longest run seen.
    // @say Best was {best}; this run is {len}. {len > best ? "New record." : "Best stays " + best + "."}
    best = Math.max(best, len); // @ask best
  }
  // @why The longest run length (0 for an empty array).
  // @returns {best}. Each number was stepped over at most twice (once as a candidate, once inside a run), so O(n).
  return best;
}

test("128. Longest Consecutive Sequence", () => {
  assert.equal(longestConsecutive([100, 4, 200, 1, 3, 2]), 4);
  assert.equal(longestConsecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]), 9);
  assert.equal(longestConsecutive([]), 0);
  assert.equal(longestConsecutive([1, 2, 0, 1]), 3);
});
