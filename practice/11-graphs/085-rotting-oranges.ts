/**
 * 994. Rotting Oranges
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/rotting-oranges/
 *
 * In an m x n grid each cell is 0 (empty), 1 (fresh orange) or 2 (rotten
 * orange). Every minute, any fresh orange 4-directionally adjacent to a
 * rotten one becomes rotten. Return the minimum number of minutes until no
 * fresh orange remains, or -1 if that is impossible.
 *
 * Example 1:
 *   Input: grid = [[2,1,1],[1,1,0],[0,1,1]]
 *   Output: 4
 *
 * Example 2:
 *   Input: grid = [[2,1,1],[0,1,1],[1,0,1]]
 *   Output: -1
 *   Explanation: The bottom-left orange is never reached.
 *
 * Example 3:
 *   Input: grid = [[0,2]]
 *   Output: 0
 *
 * Constraints:
 *   1 <= m, n <= 10
 *   grid[i][j] is 0, 1 or 2
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function orangesRotting(grid: number[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("994. Rotting Oranges", () => {
  assert.equal(orangesRotting([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), 4);
  assert.equal(orangesRotting([[2, 1, 1], [0, 1, 1], [1, 0, 1]]), -1);
  assert.equal(orangesRotting([[0, 2]]), 0);
  assert.equal(orangesRotting([[0]]), 0);
  assert.equal(orangesRotting([[1]]), -1);
});
