/**
 * 695. Max Area of Island
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/max-area-of-island/
 *
 * Given an m x n binary grid, an island is a group of 1s connected
 * 4-directionally. The area of an island is the number of cells in it.
 * Return the maximum island area, or 0 if there is no island.
 *
 * Example 1:
 *   Input: grid = [
 *     [0,0,1,0,0,0,0,1,0,0,0,0,0],
 *     [0,0,0,0,0,0,0,1,1,1,0,0,0],
 *     [0,1,1,0,1,0,0,0,0,0,0,0,0],
 *     [0,1,0,0,1,1,0,0,1,0,1,0,0],
 *     [0,1,0,0,1,1,0,0,1,1,1,0,0],
 *     [0,0,0,0,0,0,0,0,0,0,1,0,0],
 *     [0,0,0,0,0,0,0,1,1,1,0,0,0],
 *     [0,0,0,0,0,0,0,1,1,0,0,0,0]
 *   ]
 *   Output: 6
 *
 * Example 2:
 *   Input: grid = [[0,0,0,0,0,0,0,0]]
 *   Output: 0
 *
 * Constraints:
 *   1 <= m, n <= 50
 *   grid[i][j] is 0 or 1
 *
 * Approach: DFS returning area
 *   DFS from each land cell, sinking cells as we go, and return 1 plus the
 *   areas of the four neighbors. Track the maximum.
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: grid-dfs
 * Key insight: The DFS returns 1 plus the area of its four neighbours, so the size of an
 *   island falls out of the recursion with no extra counting pass. Sinking each cell as
 *   it is counted stops any cell from being added twice.
 * Real world: Finding the largest contiguous region in a map, such as the biggest
 *   wildfire burn area or the largest flooded zone in a raster of satellite pixels.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule best is the size of the largest island fully sunk and counted so far
// @viz best:best
// @why Returns the size of the biggest island, or 0 if there is none.
export function maxAreaOfIsland(grid: number[][]): number {
  // @why Save the grid size once for the bounds check.
  const rows = grid.length;
  const cols = grid[0].length;

  // @why Returns how many land cells are connected to (r, c), sinking them as it counts.
  const area = (r: number, c: number): number => {
    // @why Off the grid, water, or already counted: this spot adds 0 to the area.
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== 1) return 0;
    // @why Sink this cell so it is never counted twice.
    grid[r][c] = 0;
    // @why This cell counts as 1, plus whatever land hangs off its four neighbours.
    return 1 + area(r + 1, c) + area(r - 1, c) + area(r, c + 1) + area(r, c - 1);
  };

  // @why Tracks the largest island found so far.
  let best = 0;
  // @why Try every row as a starting point.
  for (let r = 0; r < rows; r++) {
    // @why Water and sunk cells return 0, so only fresh land starts a real count.
    for (let c = 0; c < cols; c++) best = Math.max(best, area(r, c)); // @ask best
  }
  // @why The biggest island area seen.
  return best;
}

test("695. Max Area of Island", () => {
  assert.equal(
    maxAreaOfIsland([
      [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
      [0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    ]),
    6,
  );
  assert.equal(maxAreaOfIsland([[0, 0, 0, 0, 0, 0, 0, 0]]), 0);
  assert.equal(maxAreaOfIsland([[1, 1], [1, 1]]), 4);
});
