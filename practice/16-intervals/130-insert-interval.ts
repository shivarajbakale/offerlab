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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function insert(intervals: number[][], newInterval: number[]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
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
