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
export function solveNQueens(n: number): string[][] {
  // @why Collects all solved boards.
  const res: string[][] = [];
  // @why The board, drawn with '.' for empty and 'Q' for a queen.
  const board: string[][] = Array.from({ length: n }, () => new Array<string>(n).fill("."));
  // @why Columns that already have a queen.
  const cols = new Set<number>();
  // @why Diagonals going one way; cells on the same one share `r + c`.
  const posDiag = new Set<number>(); // r + c
  // @why Diagonals going the other way; cells on the same one share `r - c`.
  const negDiag = new Set<number>(); // r - c

  // @why Place one queen in row `r`; one queen per row means no row clashes.
  const dfs = (r: number): void => {
    // @why All rows have a queen, so this board is a solution.
    if (r === n) {
      // @why Turn each row into a string and save the board.
      res.push(board.map((row) => row.join(""))); // @ask res.length // @moment found board {res.length+1}
      // @why This branch is done.
      return;
    }
    // @why Try every column for the queen in this row.
    for (let c = 0; c < n; c++) {
      // @why Skip a spot if its column or either diagonal is already taken.
      if (cols.has(c) || posDiag.has(r + c) || negDiag.has(r - c)) continue;
      // @why Claim this column.
      cols.add(c);
      // @why Claim this diagonal.
      posDiag.add(r + c);
      // @why Claim the other diagonal.
      negDiag.add(r - c);
      // @why Draw the queen on the board.
      board[r][c] = "Q"; // @ask c

      // @why Place queens in the rows below.
      dfs(r + 1);

      // @why Backtrack: free the column.
      cols.delete(c);
      // @why Free the diagonal.
      posDiag.delete(r + c);
      // @why Free the other diagonal.
      negDiag.delete(r - c);
      // @why Erase the queen from the board.
      board[r][c] = ".";
    }
  };

  // @why Start with the first row.
  dfs(0);
  // @why Return all solutions.
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
