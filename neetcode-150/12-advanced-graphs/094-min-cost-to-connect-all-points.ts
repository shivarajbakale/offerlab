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
 *
 * Approach: Prim's algorithm with a min-heap
 *   Grow the tree from point 0. Pop the cheapest edge to an unvisited
 *   point, add its cost, mark it visited, and push edges from it to every
 *   other unvisited point. Stop once all n points are in the tree.
 *
 * Time: O(n^2 log n)   Space: O(n^2)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** Minimal binary min-heap keyed by the first tuple element. */
class MinHeap<T extends number[]> {
  private data: T[] = [];

  get size(): number {
    return this.data.length;
  }

  push(item: T): void {
    const a = this.data;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.data;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function minCostConnectPoints(points: number[][]): number {
  const n = points.length;
  const visited = new Set<number>();
  const heap = new MinHeap<[number, number]>(); // [cost, point]
  heap.push([0, 0]);
  let total = 0;

  while (visited.size < n) {
    const [cost, i] = heap.pop()!;
    if (visited.has(i)) continue;
    visited.add(i);
    total += cost;
    const [x1, y1] = points[i];
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const [x2, y2] = points[j];
      heap.push([Math.abs(x1 - x2) + Math.abs(y1 - y2), j]);
    }
  }
  return total;
}

test("1584. Min Cost to Connect All Points", () => {
  assert.equal(minCostConnectPoints([[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]]), 20);
  assert.equal(minCostConnectPoints([[3, 12], [-2, 5], [-4, 1]]), 18);
  assert.equal(minCostConnectPoints([[0, 0]]), 0);
  assert.equal(minCostConnectPoints([[0, 0], [1, 1], [1, 0], [-1, 1]]), 4);
});
