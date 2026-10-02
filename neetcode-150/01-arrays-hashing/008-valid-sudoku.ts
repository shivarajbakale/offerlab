/**
 * 36. Valid Sudoku
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/valid-sudoku/
 *
 * Determine whether a 9 x 9 Sudoku board is valid. Only filled cells need to
 * be checked:
 *   - Each row contains digits 1-9 without repetition.
 *   - Each column contains digits 1-9 without repetition.
 *   - Each of the nine 3 x 3 sub-boxes contains digits 1-9 without repetition.
 * Empty cells are '.'. A valid board is not necessarily solvable.
 *
 * Example 1:
 *   Input: the standard partially-filled board (see test)
 *   Output: true
 *
 * Example 2:
 *   Input: same board but with board[0][0] = '8' (column 0 now has two 8s)
 *   Output: false
 *
 * Constraints:
 *   board.length == 9, board[i].length == 9
 *   board[i][j] is a digit 1-9 or '.'.
 *
 * Approach: Hash sets per row, column and box
 *   Scan every cell once. Keep a set for each row, each column, and each box
 *   (box index = floor(r / 3) * 3 + floor(c / 3)). Seeing a digit already in
 *   any of its three sets means the board is invalid.
 *
 * Time: O(81) = O(1)   Space: O(81) = O(1)
 *
 * Pattern: hashing
 * Key insight: Each cell belongs to exactly one row, one column and one box (index
 *   floor(r/3)*3 + floor(c/3)), so 27 sets checked in a single scan find any conflict
 *   without rescanning units.
 * Real world: A form validator enforcing several uniqueness constraints at once, such as
 *   unique username per tenant and unique email per region, with one set per scope.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isValidSudoku(board: string[][]): boolean {
  const rows = Array.from({ length: 9 }, () => new Set<string>());
  const cols = Array.from({ length: 9 }, () => new Set<string>());
  const boxes = Array.from({ length: 9 }, () => new Set<string>());

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board[r][c];
      if (v === ".") continue;
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      if (rows[r].has(v) || cols[c].has(v) || boxes[b].has(v)) return false;
      rows[r].add(v);
      cols[c].add(v);
      boxes[b].add(v);
    }
  }
  return true;
}

const parse = (rows: string[]) => rows.map((r) => r.split(""));

test("36. Valid Sudoku", () => {
  const valid = [
    "53..7....",
    "6..195...",
    ".98....6.",
    "8...6...3",
    "4..8.3..1",
    "7...2...6",
    ".6....28.",
    "...419..5",
    "....8..79",
  ];
  assert.equal(isValidSudoku(parse(valid)), true);

  const invalid = ["83..7....", ...valid.slice(1)];
  assert.equal(isValidSudoku(parse(invalid)), false);

  // Duplicate only within a 3x3 box (different row and column).
  const boxDup = [
    "1........",
    ".1.......",
    ...Array.from({ length: 7 }, () => "........."),
  ];
  assert.equal(isValidSudoku(parse(boxDup)), false);
});
