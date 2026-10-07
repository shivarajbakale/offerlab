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
// @goal how many cells are in the biggest island on this {grid.length}×{grid[0].length} grid?
export function maxAreaOfIsland(grid: number[][]): number {
  // @why Save the grid size once for the bounds check.
  // @phase Setup
  // @say Measuring an island from every one of its cells repeats the same count over and over. Instead count each island once, sinking cells as they are counted, so no cell is ever counted twice.
  const rows = grid.length;
  const cols = grid[0].length;

  // @why Returns how many land cells are connected to (r, c), sinking them as it counts.
  // @phase Flood fill: count and sink one island
  // @goal how many uncounted land cells are connected to ({r},{c})?
  const area = (r: number, c: number): number => {
    // @why Off the grid, water, or already counted: this spot adds 0 to the area.
    // @yes {r < 0 || c < 0 || r >= rows || c >= cols ? "(" + r + "," + c + ") is off the grid" : "(" + r + "," + c + ") is water, or land already counted"}, so it adds nothing.
    // @no ({r},{c}) is uncounted land, so it is part of this island.
    // @returns 0: no uncounted land at ({r},{c}), so it adds nothing to any island.
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== 1) return 0;
    // @why Sink this cell so it is never counted twice.
    // @say Sink ({r},{c}) before exploring its neighbours. A neighbour that leads back here will see water and add 0, so this cell is counted exactly once.
    grid[r][c] = 0;
    // @why This cell counts as 1, plus whatever land hangs off its four neighbours.
    // @say The island through ({r},{c}) is this cell plus whatever land hangs off its four sides. Ask each side in turn.
    // @returns 1 for ({r},{c}) plus everything its four sides found: the size of the part of the island hanging off ({r},{c}).
    return 1 + area(r + 1, c) + area(r - 1, c) + area(r, c + 1) + area(r, c - 1);
  };

  // @why Tracks the largest island found so far.
  // @phase Scan: measure each island the first time it is touched
  let best = 0;
  // @why Try every row as a starting point.
  // @yes Scan row {r}.
  // @no Every row is scanned, and every island was measured once.
  for (let r = 0; r < rows; r++) {
    // @why Water and sunk cells return 0, so only fresh land starts a real count.
    // @yes Next cell in row {r}: ({r},{c}).
    // @no Row {r} is done.
    // @say Measure from ({r},{c}). Water and land already counted give 0, so only a fresh island can beat the best so far, {best}.
    for (let c = 0; c < cols; c++) best = Math.max(best, area(r, c)); // @ask best
  }
  // @why The biggest island area seen.
  // @phase Answer
  // @returns {best === 0 ? "0: the grid has no land, so there is no island." : best + ": the largest of the islands measured. Each cell was sunk at most once, so O(m·n)."}
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
