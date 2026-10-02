/**
 * 778. Swim in Rising Water
 * Difficulty: Hard
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/swim-in-rising-water/
 *
 * You are given an n x n grid where grid[i][j] is the elevation at (i, j).
 * At time t the water depth everywhere is t. You can swim from a cell to a
 * 4-directionally adjacent cell only if both elevations are at most t, and
 * swimming takes no time. Starting at (0, 0), return the least time t at
 * which you can reach (n - 1, n - 1).
 *
 * Example 1:
 *   Input: grid = [[0,2],[1,3]]
 *   Output: 3
 *
 * Example 2:
 *   Input: grid = [
 *     [0,1,2,3,4],
 *     [24,23,22,21,5],
 *     [12,13,14,15,16],
 *     [11,17,18,19,20],
 *     [10,9,8,7,6]
 *   ]
 *   Output: 16
 *
 * Constraints:
 *   1 <= n <= 50
 *   0 <= grid[i][j] < n^2, all values unique
 *
 * Approach: Dijkstra on max-elevation-so-far
 *   The cost of a path is the maximum elevation along it. Use a min-heap of
 *   [maxSoFar, r, c]: always expand the cell reachable with the lowest
 *   required water level. The first time we pop the bottom-right cell, its
 *   key is the answer.
 *
 * Time: O(n^2 log n)   Space: O(n^2)
 *
 * Pattern: shortest-path, heap-top-k
 * Key insight: The cost of a path is its highest cell, not its sum, but Dijkstra still
 *   works because max(t, height) never decreases along a path. The first time the
 *   bottom-right cell is popped, no lower water level could reach it.
 * Real world: Robot or vehicle route planning that minimizes the worst obstacle on a
 *   route, such as the highest pass on a road trip or the deepest water a vehicle must
 *   ford.
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

export function swimInWater(grid: number[][]): number {
  const n = grid.length;
  const visited = new Set<number>([0]);
  const heap = new MinHeap<[number, number, number]>(); // [time, r, c]
  heap.push([grid[0][0], 0, 0]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (heap.size) {
    const [t, r, c] = heap.pop()!;
    if (r === n - 1 && c === n - 1) return t;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const key = nr * n + nc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n || visited.has(key)) continue;
      visited.add(key);
      heap.push([Math.max(t, grid[nr][nc]), nr, nc]);
    }
  }
  return -1;
}

test("778. Swim in Rising Water", () => {
  assert.equal(swimInWater([[0, 2], [1, 3]]), 3);
  assert.equal(
    swimInWater([
      [0, 1, 2, 3, 4],
      [24, 23, 22, 21, 5],
      [12, 13, 14, 15, 16],
      [11, 17, 18, 19, 20],
      [10, 9, 8, 7, 6],
    ]),
    16,
  );
  assert.equal(swimInWater([[0]]), 0);
  assert.equal(swimInWater([[3, 2], [0, 1]]), 3);
});
