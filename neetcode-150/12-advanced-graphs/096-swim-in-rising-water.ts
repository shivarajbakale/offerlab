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
  // @why The heap's items live in a plain array; the smallest first value is kept at index 0.
  private data: T[] = [];

  // @why Lets the caller ask how many items are still waiting.
  get size(): number {
    return this.data.length;
  }

  // @why Add an item; it must then float up to its right place.
  push(item: T): void {
    // @why A short name for the array so the code below is easier to read.
    const a = this.data;
    // @why Put the new item at the end, the only free spot in a heap array.
    a.push(item);
    // @why `i` tracks where the new item currently sits.
    let i = a.length - 1;
    // @why Keep moving up until it reaches the root.
    while (i > 0) {
      // @why The parent of index `i` sits at (i - 1) / 2, rounded down.
      const p = (i - 1) >> 1;
      // @why If the parent is already smaller or equal, the heap rule holds, so stop.
      if (a[p][0] <= a[i][0]) break;
      // @why The parent is bigger, so swap them to push the smaller item upward.
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  // @why Remove and return the smallest item (the root).
  pop(): T | undefined {
    const a = this.data;
    // @why An empty heap has nothing to give back.
    if (a.length === 0) return undefined;
    // @why Save the smallest item now, because we're about to overwrite the root.
    const top = a[0];
    // @why Take the last item out so the array stays gap-free.
    const last = a.pop()!;
    // @why If anything is left, the old root's spot must be refilled.
    if (a.length) {
      // @why Move the last item to the top; it is probably too big, so it must sink.
      a[0] = last;
      let i = 0;
      // @why Keep sinking until it is smaller than its children.
      for (;;) {
        // @why Indexes of the left and right children of `i`.
        const l = 2 * i + 1;
        const r = l + 1;
        // @why `m` is the smallest of the item and its two children; start by assuming it is `i`.
        let m = i;
        // @why If the left child exists and is smaller, it becomes the candidate.
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        // @why Same check for the right child.
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        // @why Neither child is smaller, so the item is in its right place.
        if (m === i) break;
        // @why Swap with the smaller child to push the big item down.
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    // @why Hand back the smallest item we saved at the start.
    return top;
  }
}

// @rule the heap pops cells by the lowest water level needed to reach them
// @why Returns the least time at which you can swim from the top-left to the bottom-right.
// @goal how high must the water rise before you can swim from the top-left to the bottom-right of this {grid.length}×{grid.length} grid?
export function swimInWater(grid: number[][]): number {
  // @why The grid is `n` by `n`.
  // @phase Setup: start at the top-left corner
  // @say Trying each water level from 0 up and checking reachability each time costs a full search per level. Instead, a path's cost is its highest cell, so always extend the frontier cell with the lowest such cost, like Dijkstra with max instead of plus.
  const n = grid.length;
  // @why Cells already added to the search; start with cell 0.
  const visited = new Set<number>([0]);
  // @why A priority queue that gives the cell with the lowest needed time first.
  const heap = new MinHeap<[number, number, number]>(); // [time, r, c]
  // @why Start at the top-left; we must wait until its water level at least.
  // @say You can't leave the start until the water reaches its height, {grid[0][0]}, so no path costs less than that.
  heap.push([grid[0][0], 0, 0]);
  // @why The four directions we can move.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // @why Keep going while there are cells to explore.
  // @phase Expand the cell that needs the lowest water
  // @yes {heap.data.length ? heap.data.length + (heap.data.length === 1 ? " cell is" : " cells are") + " waiting at the edge of the explored area. Take the one needing the lowest water." : "Nothing left to explore."}
  // @no {heap.data.length ? heap.data.length + (heap.data.length === 1 ? " cell is" : " cells are") + " waiting at the edge of the explored area. Take the one needing the lowest water." : "Nothing left to explore."}
  while (heap.size) {
    // @why Take the cell that needs the smallest time.
    // @say Cheapest frontier cell: ({heap.data[0][1]},{heap.data[0][2]}), reachable once the water is at {heap.data[0][0]}.
    const [t, r, c] = heap.pop()!;
    // @why We reached the goal; that time is the answer, since we always take the lowest first.
    // @yes ({r},{c}) is the bottom-right corner. Cells come out in order of water needed, so no other path gets here with less than {t}.
    // @no ({r},{c}) is not the corner yet, so spread to its neighbours.
    // @returns {t}: the lowest water level at which some path from the start reaches the corner.
    if (r === n - 1 && c === n - 1) return t;
    // @why Look at each neighbor.
    // @say Try the neighbour one step {dr === 1 ? "down" : dr === -1 ? "up" : dc === 1 ? "right" : "left"} from ({r},{c}).
    for (const [dr, dc] of dirs) {
      // @why The neighbor's row.
      // @say Neighbour row: {r + dr}.
      const nr = r + dr;
      // @why The neighbor's column.
      // @say Neighbour column: {c + dc}.
      const nc = c + dc;
      // @why One number that identifies the neighbor cell for the visited set.
      // @say Number the cell {nr} × {n} + {nc} = {nr * n + nc}, so the seen set can store it as one integer.
      const key = nr * n + nc;
      // @why Skip neighbors that are off the grid or already seen.
      // @yes {nr < 0 || nc < 0 || nr >= n || nc >= n ? "(" + nr + "," + nc + ") is off the grid." : "(" + nr + "," + nc + ") is already queued, with a cost no higher than going through here."} Skip it.
      // @no ({nr},{nc}) is on the grid and not queued yet, so this is the cheapest way found to it.
      if (nr < 0 || nc < 0 || nr >= n || nc >= n || visited.has(key)) continue;
      // @why Mark it seen so it's queued only once.
      // @say Mark ({nr},{nc}) seen now, when it is first queued. No later route can reach it cheaper, because cells are expanded in order of the water they need.
      visited.add(key); // @moment reach ({nr},{nc})
      // @why To get there we need the higher of the time so far and its own height.
      // @say A path's cost is its highest cell. Getting here needed {t}, and ({nr},{nc}) is {grid[nr][nc]} high, so max({t}, {grid[nr][nc]}) = {Math.max(t, grid[nr][nc])}.
      const need = Math.max(t, grid[nr][nc]); // @ask need
      // @why Queue the neighbor keyed by that time, so the lowest-time cell pops first.
      // @say Queue ({nr},{nc}) at water level {need}.
      heap.push([need, nr, nc]);
    }
  }
  // @why Safety return; the goal is always reachable, so it shouldn't happen.
  // @phase Answer
  // @returns -1, which never happens: every cell is reachable once the water is high enough.
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
