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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function merge(intervals: number[][]): number[][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const result: number[][] = [[...sorted[0]]];

  for (const [start, end] of sorted.slice(1)) {
    const last = result[result.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

test("56. Merge Intervals", () => {
  assert.deepEqual(merge([[1, 3], [2, 6], [8, 10], [15, 18]]), [[1, 6], [8, 10], [15, 18]]);
  assert.deepEqual(merge([[1, 4], [4, 5]]), [[1, 5]]);
  assert.deepEqual(merge([[1, 4]]), [[1, 4]]);
  assert.deepEqual(merge([[1, 4], [0, 0], [2, 3]]), [[0, 0], [1, 4]]);
});
