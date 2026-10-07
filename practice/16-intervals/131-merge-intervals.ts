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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function merge(intervals: number[][]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("56. Merge Intervals", () => {
  assert.deepEqual(merge([[1, 3], [2, 6], [8, 10], [15, 18]]), [[1, 6], [8, 10], [15, 18]]);
  assert.deepEqual(merge([[1, 4], [4, 5]]), [[1, 5]]);
  assert.deepEqual(merge([[1, 4]]), [[1, 4]]);
  assert.deepEqual(merge([[1, 4], [0, 0], [2, 3]]), [[0, 0], [1, 4]]);
});
