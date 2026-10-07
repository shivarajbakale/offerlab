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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function solveNQueens(n: number): string[][] {
  // TODO: implement
  throw new Error("Not implemented");
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
