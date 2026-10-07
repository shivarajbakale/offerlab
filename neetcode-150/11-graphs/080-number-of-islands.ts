/**
 * 200. Number of Islands
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/number-of-islands/
 *
 * Given an m x n grid of "1"s (land) and "0"s (water), return the number of
 * islands. An island is a group of land cells connected horizontally or
 * vertically, and it is surrounded by water. Assume all four edges of the
 * grid are surrounded by water.
 *
 * Example 1:
 *   Input: grid = [
 *     ["1","1","1","1","0"],
 *     ["1","1","0","1","0"],
 *     ["1","1","0","0","0"],
 *     ["0","0","0","0","0"]
 *   ]
 *   Output: 1
 *
 * Example 2:
 *   Input: grid = [
 *     ["1","1","0","0","0"],
 *     ["1","1","0","0","0"],
 *     ["0","0","1","0","0"],
 *     ["0","0","0","1","1"]
 *   ]
 *   Output: 3
 *
 * Constraints:
 *   1 <= m, n <= 300
 *   grid[i][j] is "0" or "1"
 *
 * Approach: DFS flood fill
 *   Scan every cell. When we hit unvisited land, count a new island and
 *   flood-fill (sink) all land connected to it so it is never counted again.
 *
 * Time: O(m * n)   Space: O(m * n) recursion stack in the worst case
 *
 * Pattern: grid-dfs
 * Key insight: Each time the scan meets unsunk land it must be a new island, and sinking
 *   the whole island right away guarantees no other cell of it is counted again. The grid
 *   itself is the visited set, so each cell is touched a constant number of times.
 * Real world: Image processing "connected component labeling", e.g. counting separate
 *   blobs (cells, defects, objects) in a thresholded microscope or satellite image.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule every "1" still on the grid belongs to an island not yet counted
// @why Takes the grid of "1" land and "0" water and returns how many separate islands it has.
// @goal how many separate islands are on this {grid.length}×{grid[0].length} grid?
export function numIslands(grid: string[][]): number {
  // @why Save the grid size once so the bounds check below stays short.
  // @phase Setup
  // @say Comparing every land cell with every other to decide "same island?" is (m·n)² work. Instead, the first time the scan touches an island, wipe out all of it, so each later "1" the scan meets must start a new island.
  const rows = grid.length;
  const cols = grid[0].length;

  // @why Flood fill: turns a whole island into water so we never count it again.
  // @phase Flood fill: sink every cell of this island
  // @goal which land is connected to ({r},{c})? Sink all of it.
  const sink = (r: number, c: number): void => {
    // @why Stop at the grid edge, at water, or at land we already sank.
    // @yes {r < 0 || c < 0 || r >= rows || c >= cols ? "(" + r + "," + c + ") is off the grid" : "(" + r + "," + c + ") is water, or land this flood already sank"}, so the island does not continue here.
    // @no ({r},{c}) is unsunk land touching the island, so it belongs to the same island.
    // @returns nothing; this direction is a dead end, so the flood turns back.
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== "1") return;
    // @why Mark this cell as water; the grid itself works as the visited set.
    // @say Sink ({r},{c}) before spreading. The grid itself is the visited set: a neighbour that loops back here will see water and stop.
    grid[r][c] = "0";
    // @why Spread to all four neighbours so every connected land cell gets sunk.
    // @say Spread down to ({r + 1},{c}). Land only joins an island through its four sides, so trying all four reaches every cell of it.
    sink(r + 1, c);
    // @say Down is fully sunk. Now spread up to ({r - 1},{c}).
    sink(r - 1, c);
    // @say Now spread right to ({r},{c + 1}).
    sink(r, c + 1);
    // @say Last direction: left to ({r},{c - 1}). Once it returns, every land cell reachable from ({r},{c}) is water, and the caller's flood carries on.
    sink(r, c - 1);
  };

  // @why Counts how many times we start a fresh flood fill.
  // @phase Scan: every unsunk "1" is a new island
  let islands = 0;
  // @why Scan every row so no land cell is missed.
  // @yes Scan row {r}.
  // @no Every row is scanned, so every island has been found and sunk.
  for (let r = 0; r < rows; r++) {
    // @why Scan every column in this row.
    // @yes Look at ({r},{c}).
    // @no Row {r} is done.
    for (let c = 0; c < cols; c++) {
      // @why Land still standing here must belong to an island we have not seen yet.
      // @yes ({r},{c}) is land that no flood has sunk. Every island found earlier was sunk whole, so this one is new.
      // @no ({r},{c}) is {grid[r][c] === "0" ? "water or part of an island already counted" : "not land"}, so move on.
      if (grid[r][c] === "1") {
        // @why One new island found, so count it.
        // @say Count island #{islands + 1}, then sink all of it.
        islands++; // @ask islands // @moment new island #{islands + 1} at ({r},{c})
        // @why Sink the whole island now so its other cells are not counted again.
        // @say Sink island #{islands} starting from ({r},{c}), so the scan never counts its other cells.
        // @then Island #{islands} is gone from the grid; the scan continues past ({r},{c}).
        sink(r, c);
      }
    }
  }
  // @why Every island was counted exactly once.
  // @phase Answer
  // @returns {islands}: one count per flood, and each cell was sunk at most once, so O(m·n).
  return islands;
}

test("200. Number of Islands", () => {
  assert.equal(
    numIslands([
      ["1", "1", "1", "1", "0"],
      ["1", "1", "0", "1", "0"],
      ["1", "1", "0", "0", "0"],
      ["0", "0", "0", "0", "0"],
    ]),
    1,
  );
  assert.equal(
    numIslands([
      ["1", "1", "0", "0", "0"],
      ["1", "1", "0", "0", "0"],
      ["0", "0", "1", "0", "0"],
      ["0", "0", "0", "1", "1"],
    ]),
    3,
  );
  assert.equal(numIslands([["0"]]), 0);
  assert.equal(numIslands([["1", "0", "1"]]), 2);
});
