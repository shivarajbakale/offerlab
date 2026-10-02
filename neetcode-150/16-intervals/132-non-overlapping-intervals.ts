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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function eraseOverlapIntervals(intervals: number[][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let prevEnd = sorted[0][1];
  let removed = 0;

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start >= prevEnd) {
      prevEnd = end;
    } else {
      removed++;
      prevEnd = Math.min(prevEnd, end);
    }
  }
  return removed;
}

test("435. Non-overlapping Intervals", () => {
  assert.equal(eraseOverlapIntervals([[1, 2], [2, 3], [3, 4], [1, 3]]), 1);
  assert.equal(eraseOverlapIntervals([[1, 2], [1, 2], [1, 2]]), 2);
  assert.equal(eraseOverlapIntervals([[1, 2], [2, 3]]), 0);
  assert.equal(eraseOverlapIntervals([[1, 100], [11, 22], [1, 11], [2, 12]]), 2);
});
