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

// @why Edits the board in place; returns nothing.
export function solve(board: string[][]): void {
  // @why Save the board size once for the bounds check.
  const rows = board.length;
  const cols = board[0].length;

  // @why Mark every "O" connected to this cell as "T" (safe, it can reach the border).
  const markSafe = (r: number, c: number): void => {
    // @why Stop at the edge or at anything that is not an unmarked "O".
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== "O") return;
    // @why Temporary mark so we know this "O" is safe and do not revisit it.
    board[r][c] = "T";
    // @why Spread to all four neighbours to mark the whole connected region.
    markSafe(r + 1, c);
    markSafe(r - 1, c);
    markSafe(r, c + 1);
    markSafe(r, c - 1);
  };

  // @why Start from the left and right borders.
  for (let r = 0; r < rows; r++) {
    // @why Left border cell.
    markSafe(r, 0);
    // @why Right border cell.
    markSafe(r, cols - 1);
  }
  // @why Start from the top and bottom borders.
  for (let c = 0; c < cols; c++) {
    // @why Top border cell.
    markSafe(0, c);
    // @why Bottom border cell.
    markSafe(rows - 1, c);
  }

  // @why Final pass over the whole board to settle each cell.
  for (let r = 0; r < rows; r++) {
    // @why Go through each column of this row.
    for (let c = 0; c < cols; c++) {
      // @why An "O" still here was never reached from the border, so it is surrounded: capture it.
      if (board[r][c] === "O") board[r][c] = "X";
      // @why A safe cell goes back to its real value, "O".
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
