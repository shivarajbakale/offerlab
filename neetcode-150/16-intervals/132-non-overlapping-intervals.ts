/**
 * 435. Non-overlapping Intervals
 * Difficulty: Medium
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/non-overlapping-intervals/
 *
 * Given an array of `intervals` where intervals[i] = [start, end], return
 * the minimum number of intervals you must remove so that the rest do not
 * overlap. Intervals that only touch at a point (e.g. [1,2] and [2,3]) are
 * not considered overlapping.
 *
 * Example 1:
 *   Input: intervals = [[1,2],[2,3],[3,4],[1,3]]
 *   Output: 1
 *   Explanation: Remove [1,3].
 *
 * Example 2:
 *   Input: intervals = [[1,2],[1,2],[1,2]]
 *   Output: 2
 *
 * Example 3:
 *   Input: intervals = [[1,2],[2,3]]
 *   Output: 0
 *
 * Constraints:
 *   1 <= intervals.length <= 10^5
 *   -5 * 10^4 <= start < end <= 5 * 10^4
 *
 * Approach: Greedy - sort by start, keep the earlier end
 *   Sort by start. Track the end of the last kept interval. When the next
 *   interval overlaps, we must drop one of them: count a removal and keep
 *   whichever ends sooner (it leaves the most room for the rest).
 *
 * Time: O(n log n)   Space: O(1) extra (besides sorting)
 *
 * Pattern: intervals,greedy
 * Key insight: When two intervals overlap, one must go, and keeping the one that ends
 *   sooner always leaves at least as much room for the rest. That makes the local choice
 *   safe and the count of drops minimal.
 * Real world: A conference room booking system deciding which conflicting reservations to
 *   cancel to keep the most meetings in a single room.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule prevEnd is the end of the last kept interval, as small as any choice allows
// @why Returns the fewest intervals to remove so none overlap.
// @goal how few intervals must go from {JSON.stringify(intervals)} so the rest never overlap?
export function eraseOverlapIntervals(intervals: number[][]): number {
  // @why Sort by start so we can compare each interval with the one kept before it.
  // @phase Setup: sort, and keep the first interval
  // @say Trying every subset to keep is 2^n. Instead, sort by start and walk once: whenever two clash, one must go, and the greedy choice is to keep whichever ends sooner.
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  // @why The end of the last interval we kept.
  // @say Keep [{sorted[0][0]},{sorted[0][1]}] for now. Only its end, {sorted[0][1]}, matters to whatever comes next.
  let prevEnd = sorted[0][1];
  // @why Counts the intervals we throw away.
  let removed = 0;

  // @why Look at every interval after the first.
  // @phase One pass: keep it, or drop whichever of the clashing pair ends later
  // @yes Next: {JSON.stringify(sorted[i])}, against the last kept end {prevEnd}.
  // @no Every interval has been kept or dropped.
  for (let i = 1; i < sorted.length; i++) {
    // @why The current interval.
    const [start, end] = sorted[i];
    // @why It starts after the last kept one ends, so there is no overlap.
    // @yes [{start},{end}] starts at {start}, at or after the last kept end {prevEnd}. They don't clash, so keep it for free.
    // @no [{start},{end}] starts at {start}, before the last kept end {prevEnd}. They clash, so one of the two must be removed.
    if (start >= prevEnd) {
      // @why Keep it and move the frontier to its end.
      // @say Keep it. The next interval now has to clear {end} instead of {prevEnd}.
      prevEnd = end; // @ask prevEnd
    // @why Overlap: one of the two must go.
    } else {
      // @why Count the one we remove.
      // @say Remove one: {removed} → {removed + 1}. Which one doesn't change the count, only what is left for later.
      removed++; // @moment overlap: drop one (removed {removed+1})
      // @why Keep the one that ends sooner; it leaves the most room for later intervals.
      // @say Keep the one ending sooner: min({prevEnd}, {end}) = {Math.min(prevEnd, end)}. An earlier end can only clash with fewer later intervals, never more.
      prevEnd = Math.min(prevEnd, end); // @ask prevEnd
    }
  }
  // @why The minimum number of removals.
  // @phase Answer
  // @returns {removed}: every clash cost exactly one removal, and keeping the earlier end each time never caused an extra clash.
  return removed;
}

test("435. Non-overlapping Intervals", () => {
  assert.equal(eraseOverlapIntervals([[1, 2], [2, 3], [3, 4], [1, 3]]), 1);
  assert.equal(eraseOverlapIntervals([[1, 2], [1, 2], [1, 2]]), 2);
  assert.equal(eraseOverlapIntervals([[1, 2], [2, 3]]), 0);
  assert.equal(eraseOverlapIntervals([[1, 100], [11, 22], [1, 11], [2, 12]]), 2);
});
