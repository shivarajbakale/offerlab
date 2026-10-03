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

// @why Returns the sorted list with `newInterval` added and any overlaps merged.
export function insert(intervals: number[][], newInterval: number[]): number[][] {
  // @why The final merged list, built left to right.
  const result: number[][] = [];
  // @why The new interval, which grows as it absorbs the intervals it overlaps.
  let [start, end] = newInterval;

  // @why Intervals are sorted, so we can walk through them in order.
  for (let i = 0; i < intervals.length; i++) {
    // @why The current interval's start and end.
    const [s, e] = intervals[i];
    // @why Current interval is entirely after the new one: no overlap, and no later one can overlap.
    if (end < s) {
      // @why The new interval is finished, so place it here.
      result.push([start, end]);
      // @why Everything after is untouched, so just copy the rest and finish early.
      return result.concat(intervals.slice(i));
    // @why Current interval is entirely before the new one, so keep it as it is.
    } else if (e < start) {
      // @why Copy it unchanged.
      result.push([s, e]);
    // @why They overlap, so merge them.
    } else {
      // @why The merged interval starts at the earlier start.
      start = Math.min(start, s);
      // @why The merged interval ends at the later end.
      end = Math.max(end, e);
    }
  }
  // @why After the loop the new interval was never placed, so it goes at the end.
  result.push([start, end]);
  // @why The merged list.
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
