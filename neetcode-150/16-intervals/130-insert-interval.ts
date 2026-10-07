/**
 * 57. Insert Interval
 * Difficulty: Medium
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/insert-interval/
 *
 * You are given an array of non-overlapping `intervals`, each [start, end],
 * sorted by start, and a `newInterval`. Insert newInterval so the array is
 * still sorted and non-overlapping, merging overlapping intervals where
 * necessary. Return the resulting array.
 *
 * Example 1:
 *   Input: intervals = [[1,3],[6,9]], newInterval = [2,5]
 *   Output: [[1,5],[6,9]]
 *
 * Example 2:
 *   Input: intervals = [[1,2],[3,5],[6,7],[8,10],[12,16]], newInterval = [4,8]
 *   Output: [[1,2],[3,10],[12,16]]
 *
 * Constraints:
 *   0 <= intervals.length <= 10^4
 *   0 <= start <= end <= 10^5
 *   intervals is sorted by start and non-overlapping
 *
 * Approach: Single linear pass
 *   For each interval:
 *     - entirely before newInterval: keep it.
 *     - entirely after newInterval: emit newInterval, then the rest as-is.
 *     - overlapping: widen newInterval to cover it.
 *   If we never emitted newInterval, append it at the end.
 *
 * Time: O(n)   Space: O(n) for the output
 *
 * Pattern: intervals
 * Key insight: Because the list is sorted and disjoint, each interval is either fully left
 *   of the new one, fully right of it, or overlapping. Overlaps just widen the new
 *   interval; the first interval fully to the right means everything after is untouched.
 * Real world: A calendar app inserting a new booking into a sorted list of busy blocks,
 *   merging it with any blocks it touches.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule result holds every interval ending before start; start..end has absorbed all overlaps
// @why Returns the sorted list with `newInterval` added and any overlaps merged.
// @goal where does [{newInterval[0]},{newInterval[1]}] go in {JSON.stringify(intervals)}, and which intervals does it swallow?
export function insert(intervals: number[][], newInterval: number[]): number[][] {
  // @why The final merged list, built left to right.
  // @phase Setup: an output list and a growing copy of the new interval
  // @say Appending the new interval and re-sorting costs n log n, then a merge pass on top. The list is already sorted, so one left-to-right pass can copy, absorb, or stop at each interval.
  const result: number[][] = [];
  // @why The new interval, which grows as it absorbs the intervals it overlaps.
  // @say Hold the new interval as [{newInterval[0]},{newInterval[1]}]. It will stretch each time it meets an overlapping interval.
  let [start, end] = newInterval;

  // @why Intervals are sorted, so we can walk through them in order.
  // @phase One pass: copy what is before, absorb what overlaps, stop at what is after
  // @yes Look at interval {i}, {JSON.stringify(intervals[i])}, against the new one, currently [{start},{end}].
  // @no Every interval ended before or overlapped [{start},{end}]; none lies wholly after it, so it still has to be placed.
  for (let i = 0; i < intervals.length; i++) {
    // @why The current interval's start and end.
    const [s, e] = intervals[i];
    // @why Current interval is entirely after the new one: no overlap, and no later one can overlap.
    // @yes [{s},{e}] starts at {s}, after the new interval ends at {end}. They don't touch, and since the list is sorted, nothing after it can touch either.
    // @no [{s},{e}] starts at {s}, not after {end}, so it is not wholly to the right of the new interval.
    if (end < s) {
      // @why The new interval is finished, so place it here.
      // @say Nothing left can overlap [{start},{end}], so it is final. Place it before [{s},{e}].
      result.push([start, end]); // @moment placed [{start},{end}]
      // @why Everything after is untouched, so just copy the rest and finish early.
      // @returns the list so far plus the {intervals.length - i} untouched {intervals.length - i === 1 ? "interval" : "intervals"} from index {i} on: no need to look at them one by one.
      return result.concat(intervals.slice(i));
    // @why Current interval is entirely before the new one, so keep it as it is.
    // @yes [{s},{e}] ends at {e}, before the new interval starts at {start}. No overlap, and it comes first, so it goes into the result unchanged.
    // @no [{s},{e}] ends at {e}, not before {start}, and starts at {s}, not after {end}. Neither is wholly to one side, so they overlap.
    } else if (e < start) {
      // @why Copy it unchanged.
      // @say Copy [{s},{e}] as is: the new interval can never reach back to it.
      result.push([s, e]);
    // @why They overlap, so merge them.
    } else {
      // @why The merged interval starts at the earlier start.
      // @say Absorb [{s},{e}]: the merged interval starts at the earlier of {start} and {s}, = {Math.min(start, s)}.
      start = Math.min(start, s); // @ask start
      // @why The merged interval ends at the later end.
      // @say It ends at the later of {end} and {e}, = {Math.max(end, e)}. Don't place it yet: the next interval may overlap the bigger range too.
      end = Math.max(end, e); // @ask end
    }
  }
  // @why After the loop the new interval was never placed, so it goes at the end.
  // @phase Answer
  // @say No interval came after [{start},{end}], so it belongs at the very end.
  result.push([start, end]);
  // @why The merged list.
  // @returns {JSON.stringify(result)}: one pass, O(n), no sorting needed.
  return result;
}

test("57. Insert Interval", () => {
  assert.deepEqual(insert([[1, 3], [6, 9]], [2, 5]), [[1, 5], [6, 9]]);
  assert.deepEqual(
    insert([[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]),
    [[1, 2], [3, 10], [12, 16]],
  );
  assert.deepEqual(insert([], [5, 7]), [[5, 7]]);
  assert.deepEqual(insert([[3, 4]], [1, 2]), [[1, 2], [3, 4]]);
});
