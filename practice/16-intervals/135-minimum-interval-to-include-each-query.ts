/**
 * 1851. Minimum Interval to Include Each Query
 * Difficulty: Hard
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/minimum-interval-to-include-each-query/
 *
 * You are given `intervals` where intervals[i] = [left, right] (inclusive);
 * its size is right - left + 1. You are also given `queries`. For each
 * query q, find the size of the smallest interval with left <= q <= right,
 * or -1 if no interval contains q. Return the answers in query order.
 *
 * Example 1:
 *   Input: intervals = [[1,4],[2,4],[3,6],[4,4]], queries = [2,3,4,5]
 *   Output: [3,3,1,4]
 *
 * Example 2:
 *   Input: intervals = [[2,3],[2,5],[1,8],[20,25]], queries = [2,19,5,22]
 *   Output: [2,-1,4,6]
 *
 * Constraints:
 *   1 <= intervals.length, queries.length <= 10^5
 *   1 <= left <= right <= 10^7
 *   1 <= queries[j] <= 10^7
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function minInterval(intervals: number[][], queries: number[]): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("1851. Minimum Interval to Include Each Query", () => {
  assert.deepEqual(minInterval([[1, 4], [2, 4], [3, 6], [4, 4]], [2, 3, 4, 5]), [3, 3, 1, 4]);
  assert.deepEqual(minInterval([[2, 3], [2, 5], [1, 8], [20, 25]], [2, 19, 5, 22]), [2, -1, 4, 6]);
  assert.deepEqual(minInterval([[5, 5]], [1, 5, 5, 9]), [-1, 1, 1, -1]);
});
