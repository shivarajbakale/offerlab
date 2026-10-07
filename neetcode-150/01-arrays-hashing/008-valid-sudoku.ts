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

// @rule rows[r], cols[c] and boxes[b] hold every digit already placed in them
// @why Return true if no row, column or 3x3 box repeats a digit.
export function isValidSudoku(board: string[][]): boolean {
  // @why One set of seen digits for each row.
  const rows = Array.from({ length: 9 }, () => new Set<string>());
  // @why One set of seen digits for each column.
  const cols = Array.from({ length: 9 }, () => new Set<string>());
  // @why One set of seen digits for each 3x3 box.
  const boxes = Array.from({ length: 9 }, () => new Set<string>());

  // @why Go through every row.
  for (let r = 0; r < 9; r++) {
    // @why Go through every cell in the row.
    for (let c = 0; c < 9; c++) {
      // @why The digit (or a dot) in this cell.
      const v = board[r][c];
      // @why An empty cell can't break a rule, so skip it.
      if (v === ".") continue;
      // @why Turn the row and column into a box number from 0 to 8.
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3); // @ask b
      // @why If this digit is already in its row, column or box, the board is invalid.
      if (rows[r].has(v) || cols[c].has(v) || boxes[b].has(v)) return false;
      // @why Remember the digit in this row.
      rows[r].add(v);
      // @why Remember the digit in this column.
      cols[c].add(v);
      // @why Remember the digit in this box.
      boxes[b].add(v);
    }
  }
  // @why No repeats found anywhere, so the board is valid.
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
