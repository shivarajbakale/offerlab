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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxAreaOfIsland(grid: number[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
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
