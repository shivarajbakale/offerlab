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

// @rule every "T" is an "O" joined to the border, so it can never be captured
// @why Edits the board in place; returns nothing.
// @goal which "O" regions of this {board.length}×{board[0].length} board are fully surrounded by "X", and should be captured?
export function solve(board: string[][]): void {
  // @why Save the board size once for the bounds check.
  // @phase Setup
  // @say Checking each "O" region for an escape route means exploring it and proving no path reaches the edge, region by region. Flip the question: any "O" joined to the border is safe, so mark those from the border inward. Whatever "O" is left must be surrounded.
  const rows = board.length;
  const cols = board[0].length;

  // @why Mark every "O" connected to this cell as "T" (safe, it can reach the border).
  // @phase Flood from the border: mark every "O" that can escape
  // @goal which "O" cells join ({r},{c}) to the border? Mark them all safe.
  const markSafe = (r: number, c: number): void => {
    // @why Stop at the edge or at anything that is not an unmarked "O".
    // @yes {r < 0 || c < 0 || r >= rows || c >= cols ? "(" + r + "," + c + ") is off the board" : board[r][c] === "T" ? "(" + r + "," + c + ") is already marked safe" : "(" + r + "," + c + ") is an X, a wall the region can't pass"}, so the flood stops here.
    // @no ({r},{c}) is an "O" touching a safe cell (or the border), so it can escape too.
    // @returns nothing; this direction adds no safe cell.
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== "O") return;
    // @why Temporary mark so we know this "O" is safe and do not revisit it.
    // @say Mark ({r},{c}) as "T": safe. Using a third letter keeps it apart from the "O"s still to be judged, and stops the flood from coming back here.
    board[r][c] = "T"; // @moment safe ({r},{c})
    // @why Spread to all four neighbours to mark the whole connected region.
    // @say Spread to the cell below, ({r + 1},{c}). An "O" next to a safe "O" is joined to the border through it.
    markSafe(r + 1, c);
    // @say Spread up to ({r - 1},{c}).
    markSafe(r - 1, c);
    // @say Spread right to ({r},{c + 1}).
    markSafe(r, c + 1);
    // @say Last, spread left to ({r},{c - 1}). After this, the whole region through ({r},{c}) is marked safe.
    markSafe(r, c - 1);
  };

  // @why Start from the left and right borders.
  // @phase Start a flood from every border cell
  // @yes Row {r}: try its left and right border cells.
  // @no The left and right borders are done.
  for (let r = 0; r < rows; r++) {
    // @why Left border cell.
    // @say ({r},{0}) is on the border. If it is an "O", it escapes, and so does everything joined to it.
    markSafe(r, 0);
    // @why Right border cell.
    // @say ({r},{cols - 1}) is on the right border; flood from it too.
    markSafe(r, cols - 1);
  }
  // @why Start from the top and bottom borders.
  // @yes Column {c}: try its top and bottom border cells.
  // @no Every border cell has been tried: each "T" now can escape, and every "O" left is surrounded.
  for (let c = 0; c < cols; c++) {
    // @why Top border cell.
    // @say ({0},{c}) is on the top border; flood from it.
    markSafe(0, c);
    // @why Bottom border cell.
    // @say ({rows - 1},{c}) is on the bottom border; flood from it.
    markSafe(rows - 1, c);
  }

  // @why Final pass over the whole board to settle each cell.
  // @phase Settle: capture what is left, restore what is safe
  // @yes Settle row {r}.
  // @no Every cell is settled, and the board is changed in place, so there is nothing to return.
  for (let r = 0; r < rows; r++) {
    // @why Go through each column of this row.
    // @yes Settle ({r},{c}).
    // @no Row {r} is done.
    for (let c = 0; c < cols; c++) {
      // @why An "O" still here was never reached from the border, so it is surrounded: capture it.
      // @yes ({r},{c}) is still an "O": no flood from the border reached it, so it is surrounded. Capture it as "X".
      // @no ({r},{c}) is {board[r][c] === "T" ? "marked safe, not a leftover \"O\"" : "an \"X\""}, so it is not captured.
      if (board[r][c] === "O") board[r][c] = "X"; // @ask board[r][c]
      // @why A safe cell goes back to its real value, "O".
      // @yes ({r},{c}) was marked safe, so it stays an "O".
      // @no ({r},{c}) is an "X" and stays one.
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
