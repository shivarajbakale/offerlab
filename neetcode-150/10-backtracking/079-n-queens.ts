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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function solveNQueens(n: number): string[][] {
  const res: string[][] = [];
  const board: string[][] = Array.from({ length: n }, () => new Array<string>(n).fill("."));
  const cols = new Set<number>();
  const posDiag = new Set<number>(); // r + c
  const negDiag = new Set<number>(); // r - c

  const dfs = (r: number): void => {
    if (r === n) {
      res.push(board.map((row) => row.join("")));
      return;
    }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || posDiag.has(r + c) || negDiag.has(r - c)) continue;
      cols.add(c);
      posDiag.add(r + c);
      negDiag.add(r - c);
      board[r][c] = "Q";

      dfs(r + 1);

      cols.delete(c);
      posDiag.delete(r + c);
      negDiag.delete(r - c);
      board[r][c] = ".";
    }
  };

  dfs(0);
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
