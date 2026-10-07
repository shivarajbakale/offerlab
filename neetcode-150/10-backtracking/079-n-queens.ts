/**
 * 51. N-Queens
 * Difficulty: Hard
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/n-queens/
 *
 * Place `n` queens on an n x n chessboard so that no two queens attack each
 * other (no shared row, column or diagonal). Return all distinct solutions,
 * in any order. Each solution is a board of n strings where 'Q' marks a
 * queen and '.' an empty square.
 *
 * Example 1:
 *   Input: n = 4
 *   Output: [[".Q..","...Q","Q...","..Q."], ["..Q.","Q...","...Q",".Q.."]]
 *
 * Example 2:
 *   Input: n = 1
 *   Output: [["Q"]]
 *
 * Constraints:
 *   1 <= n <= 9
 *
 * Approach: Row-by-row backtracking with attack sets
 *   Place exactly one queen per row. Track occupied columns, positive
 *   diagonals (r + c) and negative diagonals (r - c) in sets so each safety
 *   check is O(1). Place, recurse to the next row, then remove (backtrack).
 *
 * Time: O(n!)   Space: O(n^2) for the board
 *
 * Pattern: backtracking
 * Key insight: All squares on one diagonal share r + c, and all on one anti-diagonal
 *   share r - c, so three sets answer "is this square attacked?" in O(1). Placing exactly
 *   one queen per row removes row conflicts by construction.
 * Real world: Constraint solvers for timetabling or seating plans, which place one item
 *   per slot and keep sets of already-used resources so each conflict check is constant
 *   time.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule cols, posDiag and negDiag hold exactly the queens in rows 0..r-1, none attacking
// @why Returns every way to place `n` queens so none attack each other.
// @goal in which ways can {n} {n === 1 ? "queen" : "queens"} sit on a {n}×{n} board with none attacking another?
export function solveNQueens(n: number): string[][] {
  // @why Collects all solved boards.
  // @phase Setup: one row at a time, with O(1) attack checks
  // @say Trying every way to put {n} queens on {n * n} squares is astronomically many boards. Two queens can't share a row, so place exactly one per row, and keep sets of taken columns and diagonals so each square is checked in O(1) instead of scanning the board.
  const res: string[][] = [];
  // @why The board, drawn with '.' for empty and 'Q' for a queen.
  const board: string[][] = Array.from({ length: n }, () => new Array<string>(n).fill("."));
  // @why Columns that already have a queen.
  const cols = new Set<number>();
  // @why Diagonals going one way; cells on the same one share `r + c`.
  // @say Along a "/" diagonal, the row goes up by one as the column goes down by one, so r + c never changes: one number names the whole diagonal.
  const posDiag = new Set<number>(); // r + c
  // @why Diagonals going the other way; cells on the same one share `r - c`.
  // @say Along a "\" diagonal, row and column grow together, so r − c never changes.
  const negDiag = new Set<number>(); // r - c

  // @why Place one queen in row `r`; one queen per row means no row clashes.
  // @goal {r === 0 ? "on an empty board, in which ways can all " + n + " rows be filled?" : r === n ? "with a queen in every row, is the board complete?" : "with queens in the " + (r === 1 ? "row" : r + " rows") + " above, in which ways can " + (r === n - 1 ? "the last row" : "rows " + r + " to " + (n - 1)) + " be filled?"}
  const dfs = (r: number): void => {
    // @why All rows have a queen, so this board is a solution.
    // @phase Place a queen in row r
    // @yes All {n} rows have a queen and none attack each other, so this board is a solution.
    // @no Row {r} still needs a queen.
    if (r === n) {
      // @why Turn each row into a string and save the board.
      // @say Save the board as {n} strings: {JSON.stringify(board.map((row) => row.join("")))}. Joining makes a fresh copy, so undoing the queens later won't change it.
      res.push(board.map((row) => row.join(""))); // @ask res.length // @moment found board {res.length+1}
      // @why This branch is done.
      // @returns nothing; this branch is complete and gave solution {res.length}.
      return;
    }
    // @why Try every column for the queen in this row.
    // @yes Try column {c} for row {r}'s queen.
    // @no Every column in row {r} has been tried.
    for (let c = 0; c < n; c++) {
      // @why Skip a spot if its column or either diagonal is already taken.
      // @yes ({r}, {c}) is attacked: {cols.has(c) ? "column " + c + " already has a queen" : posDiag.has(r + c) ? "a queen above shares its / diagonal (r + c = " + (r + c) + ")" : "a queen above shares its \\ diagonal (r − c = " + (r - c) + ")"}. Skip it.
      // @no ({r}, {c}) is safe: column {c}, diagonal r + c = {r + c} and diagonal r − c = {r - c} are all free.
      if (cols.has(c) || posDiag.has(r + c) || negDiag.has(r - c)) continue;
      // @why Claim this column.
      // @say Place the queen at ({r}, {c}) and claim column {c}, so no row below can use it.
      cols.add(c);
      // @why Claim this diagonal.
      // @say Claim the / diagonal r + c = {r + c}.
      posDiag.add(r + c);
      // @why Claim the other diagonal.
      // @say Claim the \ diagonal r − c = {r - c}.
      negDiag.add(r - c);
      // @why Draw the queen on the board.
      board[r][c] = "Q"; // @ask c

      // @why Place queens in the rows below.
      // @say {r + 1 === n ? "That was the last row; the next call records the board." : "Now fill rows " + (r + 1) + " to " + (n - 1) + " around it."}
      dfs(r + 1);

      // @why Backtrack: free the column.
      // @say Every board with a queen at ({r}, {c}) has been explored. Undo: free column {c} so the next column of row {r} starts from the same board.
      cols.delete(c);
      // @why Free the diagonal.
      posDiag.delete(r + c);
      // @why Free the other diagonal.
      negDiag.delete(r - c);
      // @why Erase the queen from the board.
      board[r][c] = ".";
    }
    // @returns nothing; every column of row {r} has been tried.
  };

  // @why Start with the first row.
  // @phase Run the choices
  // @say Start at row 0 with an empty board.
  dfs(0);
  // @why Return all solutions.
  // @returns all {res.length} {res.length === 1 ? "solution" : "solutions"}.
  return res;
}

const normalize = (xs: string[][]) => xs.map((x) => x.join("/")).sort();

test("51. N-Queens", () => {
  assert.deepEqual(
    normalize(solveNQueens(4)),
    normalize([
      [".Q..", "...Q", "Q...", "..Q."],
      ["..Q.", "Q...", "...Q", ".Q.."],
    ]),
  );
  assert.deepEqual(solveNQueens(1), [["Q"]]);
  assert.deepEqual(solveNQueens(3), []);
  assert.equal(solveNQueens(8).length, 92);
});
