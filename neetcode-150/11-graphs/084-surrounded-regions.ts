/**
 * 130. Surrounded Regions
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/surrounded-regions/
 *
 * Given an m x n board of "X" and "O", capture every region of "O"s that is
 * completely surrounded by "X"s (4-directionally) by flipping those "O"s to
 * "X". A region that touches the border is not surrounded. Modify the board
 * in place; return nothing.
 *
 * Example 1:
 *   Input: board = [
 *     ["X","X","X","X"],
 *     ["X","O","O","X"],
 *     ["X","X","O","X"],
 *     ["X","O","X","X"]
 *   ]
 *   Output: [
 *     ["X","X","X","X"],
 *     ["X","X","X","X"],
 *     ["X","X","X","X"],
 *     ["X","O","X","X"]
 *   ]
 *
 * Example 2:
 *   Input: board = [["X"]]
 *   Output: [["X"]]
 *
 * Constraints:
 *   1 <= m, n <= 200
 *   board[i][j] is "X" or "O"
 *
 * Approach: Reverse thinking - mark the safe cells
 *   1. DFS from every border "O", marking reachable "O"s as "T" (safe).
 *   2. Flip every remaining "O" to "X" (they are surrounded).
 *   3. Turn every "T" back into "O".
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: grid-dfs
 * Key insight: Proving an "O" region is enclosed is hard, but proving it escapes is easy:
 *   any "O" connected to the border is safe. Mark those from the border first, and
 *   everything left over must be surrounded.
 * Real world: Paint-bucket and game logic like Go captures, where a region is captured
 *   unless it can reach a liberty or edge, found by flooding out from the safe cells.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function solve(board: string[][]): void {
  const rows = board.length;
  const cols = board[0].length;

  const markSafe = (r: number, c: number): void => {
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== "O") return;
    board[r][c] = "T";
    markSafe(r + 1, c);
    markSafe(r - 1, c);
    markSafe(r, c + 1);
    markSafe(r, c - 1);
  };

  for (let r = 0; r < rows; r++) {
    markSafe(r, 0);
    markSafe(r, cols - 1);
  }
  for (let c = 0; c < cols; c++) {
    markSafe(0, c);
    markSafe(rows - 1, c);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c] === "O") board[r][c] = "X";
      else if (board[r][c] === "T") board[r][c] = "O";
    }
  }
}

test("130. Surrounded Regions", () => {
  const b1 = [
    ["X", "X", "X", "X"],
    ["X", "O", "O", "X"],
    ["X", "X", "O", "X"],
    ["X", "O", "X", "X"],
  ];
  solve(b1);
  assert.deepEqual(b1, [
    ["X", "X", "X", "X"],
    ["X", "X", "X", "X"],
    ["X", "X", "X", "X"],
    ["X", "O", "X", "X"],
  ]);

  const b2 = [["X"]];
  solve(b2);
  assert.deepEqual(b2, [["X"]]);

  // Interior region connected to the border survives.
  const b3 = [
    ["X", "O", "X"],
    ["X", "O", "X"],
    ["X", "X", "X"],
  ];
  solve(b3);
  assert.deepEqual(b3, [
    ["X", "O", "X"],
    ["X", "O", "X"],
    ["X", "X", "X"],
  ]);
});
