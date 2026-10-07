/**
 * 973. K Closest Points to Origin
 * Difficulty: Medium
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/k-closest-points-to-origin/
 *
 * Given an array of `points` where points[i] = [xi, yi] and an integer `k`,
 * return the `k` points closest to the origin (0, 0) by Euclidean distance.
 * The answer may be returned in any order and is guaranteed to be unique
 * (except for order).
 *
 * Example 1:
 *   Input: points = [[1, 3], [-2, 2]], k = 1
 *   Output: [[-2, 2]]
 *
 * Example 2:
 *   Input: points = [[3, 3], [5, -1], [-2, 4]], k = 2
 *   Output: [[3, 3], [-2, 4]]
 *
 * Constraints:
 *   1 <= k <= points.length <= 10^4
 *   -10^4 <= xi, yi <= 10^4
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function kClosest(points: number[][], k: number): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

const sortPts = (pts: number[][]) =>
  [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

test("973. K Closest Points to Origin", () => {
  assert.deepEqual(kClosest([[1, 3], [-2, 2]], 1), [[-2, 2]]);
  assert.deepEqual(
    sortPts(kClosest([[3, 3], [5, -1], [-2, 4]], 2)),
    sortPts([[3, 3], [-2, 4]]),
  );
  // k equals number of points
  assert.deepEqual(sortPts(kClosest([[0, 1], [1, 0]], 2)), [[0, 1], [1, 0]]);
});
