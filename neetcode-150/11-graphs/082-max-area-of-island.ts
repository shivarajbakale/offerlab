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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxAreaOfIsland(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;

  const area = (r: number, c: number): number => {
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== 1) return 0;
    grid[r][c] = 0;
    return 1 + area(r + 1, c) + area(r - 1, c) + area(r, c + 1) + area(r, c - 1);
  };

  let best = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) best = Math.max(best, area(r, c));
  }
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
