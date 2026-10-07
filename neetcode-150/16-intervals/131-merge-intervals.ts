/**
 * 56. Merge Intervals
 * Difficulty: Medium
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/merge-intervals/
 *
 * Given an array of `intervals` where intervals[i] = [start, end], merge all
 * overlapping intervals and return an array of the non-overlapping intervals
 * that cover exactly the same ranges. Touching intervals (e.g. [1,4] and
 * [4,5]) count as overlapping.
 *
 * Example 1:
 *   Input: intervals = [[1,3],[2,6],[8,10],[15,18]]
 *   Output: [[1,6],[8,10],[15,18]]
 *
 * Example 2:
 *   Input: intervals = [[1,4],[4,5]]
 *   Output: [[1,5]]
 *
 * Constraints:
 *   1 <= intervals.length <= 10^4
 *   0 <= start <= end <= 10^4
 *
 * Approach: Sort by start, then sweep
 *   After sorting, an interval overlaps the last merged one iff its start
 *   <= last end. If so, extend the last end; otherwise start a new block.
 *
 * Time: O(n log n)   Space: O(n)
 *
 * Pattern: intervals
 * Key insight: After sorting by start, any interval that overlaps the merged set must
 *   overlap the last merged block, so a single comparison with the last end decides extend
 *   or start new.
 * Real world: Combining overlapping busy times from several calendars into one free/busy
 *   view, or merging overlapping byte ranges in an HTTP range request.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule result is sorted with no overlaps; only its last interval can still grow
// @why Returns the intervals with all overlapping ones combined.
// @goal which intervals in {JSON.stringify(intervals)} overlap, and what do they merge into?
export function merge(intervals: number[][]): number[][] {
  // @why Sort by start so any overlapping intervals end up next to each other; copy to keep the input intact.
  // @phase Setup: sort so overlaps sit side by side
  // @say Comparing every pair of intervals is n² work. Sorting by start (n log n) puts any interval that overlaps another right after it, so one pass only ever compares with the last merged interval.
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  // @why Merged intervals; seeded with the first one (copied so we do not change the input).
  // @say Start the answer with the earliest interval, [{sorted[0][0]},{sorted[0][1]}]. Nothing starts before it, so it opens the first group.
  const result: number[][] = [[...sorted[0]]];

  // @why Go through the rest in start order.
  // @phase One pass: extend the last group or start a new one
  // @say Next by start: [{start},{end}].
  for (const [start, end] of sorted.slice(1)) {
    // @why The most recent merged interval, the only one the next can overlap.
    const last = result[result.length - 1];
    // @why Next one starts before `last` ends, so they overlap: stretch `last` to the later end (it may sit inside).
    // @yes [{start},{end}] starts at {start}, no later than the group [{last[0]},{last[1]}] ends, so they overlap. The group now ends at the later of {last[1]} and {end}, = {Math.max(last[1], end)}.
    // @no [{start},{end}] starts at {start}, after the group [{last[0]},{last[1]}] ends. Every later interval starts even later, so that group is closed for good.
    if (start <= last[1]) last[1] = Math.max(last[1], end); // @ask last[1]
    // @why No overlap, so this interval begins a new group.
    // @say Open a new group with [{start},{end}]; from now on, only it can grow.
    else result.push([start, end]); // @ask result.length // @moment new interval [{start},{end}]
  }
  // @why The merged intervals.
  // @phase Answer
  // @returns {JSON.stringify(result)}: {result.length} {result.length === 1 ? "group" : "groups"}, found in one pass after an n log n sort.
  return result;
}

test("56. Merge Intervals", () => {
  assert.deepEqual(merge([[1, 3], [2, 6], [8, 10], [15, 18]]), [[1, 6], [8, 10], [15, 18]]);
  assert.deepEqual(merge([[1, 4], [4, 5]]), [[1, 5]]);
  assert.deepEqual(merge([[1, 4]]), [[1, 4]]);
  assert.deepEqual(merge([[1, 4], [0, 0], [2, 3]]), [[0, 0], [1, 4]]);
});
