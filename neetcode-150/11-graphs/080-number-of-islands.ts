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

export function numIslands(grid: string[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;

  const sink = (r: number, c: number): void => {
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== "1") return; // @say Stop at the edge or at water/already-sunk land
    grid[r][c] = "0"; // @say Sink ({r},{c}) so this land is never counted twice
    sink(r + 1, c); // @say Flood out to all 4 neighbours to sink the whole island
    sink(r - 1, c);
    sink(r, c + 1);
    sink(r, c - 1);
  };

  let islands = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === "1") { // @say Unsunk land here means we found a brand-new island
        islands++; // @say Count island #{islands + 1}, then sink all of it
        sink(r, c);
      }
    }
  }
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
