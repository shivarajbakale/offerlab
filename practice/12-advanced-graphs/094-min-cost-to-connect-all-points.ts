/**
 * 1584. Min Cost to Connect All Points
 * Difficulty: Medium
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/min-cost-to-connect-all-points/
 *
 * Given an array `points` of 2D integer coordinates, the cost of connecting
 * two points is their Manhattan distance |xi - xj| + |yi - yj|. Return the
 * minimum total cost to connect all points so that there is exactly one
 * simple path between any two points (i.e. a minimum spanning tree).
 *
 * Example 1:
 *   Input: points = [[0,0],[2,2],[3,10],[5,2],[7,0]]
 *   Output: 20
 *
 * Example 2:
 *   Input: points = [[3,12],[-2,5],[-4,1]]
 *   Output: 18
 *
 * Constraints:
 *   1 <= points.length <= 1000
 *   -10^6 <= xi, yi <= 10^6
 *   All points are distinct
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function minCostConnectPoints(points: number[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("1584. Min Cost to Connect All Points", () => {
  assert.equal(minCostConnectPoints([[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]]), 20);
  assert.equal(minCostConnectPoints([[3, 12], [-2, 5], [-4, 1]]), 18);
  assert.equal(minCostConnectPoints([[0, 0]]), 0);
  assert.equal(minCostConnectPoints([[0, 0], [1, 1], [1, 0], [-1, 1]]), 4);
});
