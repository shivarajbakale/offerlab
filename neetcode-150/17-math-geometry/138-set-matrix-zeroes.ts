/**
 * 73. Set Matrix Zeroes
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/set-matrix-zeroes/
 *
 * Given an m x n integer `matrix`, if an element is 0, set its entire row
 * and column to 0. Do it in place. Follow-up: use only constant extra space.
 *
 * Example 1:
 *   Input: matrix = [[1,1,1],[1,0,1],[1,1,1]]
 *   Output: [[1,0,1],[0,0,0],[1,0,1]]
 *
 * Example 2:
 *   Input: matrix = [[0,1,2,0],[3,4,5,2],[1,3,1,5]]
 *   Output: [[0,0,0,0],[0,4,5,0],[0,3,1,0]]
 *
 * Constraints:
 *   1 <= m, n <= 200
 *   -2^31 <= matrix[i][j] <= 2^31 - 1
 *
 * Approach: Use the first row and column as markers
 *   Row 0 marks which columns to zero; column 0 marks which rows to zero.
 *   Cell (0, 0) is shared, so keep a separate flag `rowZero` for row 0.
 *   1) Scan: for each zero at (r, c), set matrix[0][c] = 0 and either
 *      matrix[r][0] = 0 (r > 0) or rowZero = true (r == 0).
 *   2) Zero inner cells (r, c >= 1) whose row or column marker is 0.
 *   3) If matrix[0][0] == 0, zero column 0. If rowZero, zero row 0.
 *
 * Time: O(m * n)   Space: O(1)
 *
 * Pattern: matrix-simulation
 * Key insight: The first row and first column can store the zero flags for every column
 *   and row, because they are only overwritten at the very end. One extra boolean handles
 *   the shared corner cell, giving O(1) extra space.
 * Real world: A spreadsheet or data-cleaning job that blanks out every row and column
 *   touched by an invalid cell, done in place on a large table.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function setZeroes(matrix: number[][]): void {
  const rows = matrix.length;
  const cols = matrix[0].length;
  let rowZero = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c] !== 0) continue;
      matrix[0][c] = 0;
      if (r > 0) matrix[r][0] = 0;
      else rowZero = true;
    }
  }

  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      if (matrix[0][c] === 0 || matrix[r][0] === 0) matrix[r][c] = 0;
    }
  }

  if (matrix[0][0] === 0) {
    for (let r = 0; r < rows; r++) matrix[r][0] = 0;
  }
  if (rowZero) {
    for (let c = 0; c < cols; c++) matrix[0][c] = 0;
  }
}

test("73. Set Matrix Zeroes", () => {
  const m1 = [[1, 1, 1], [1, 0, 1], [1, 1, 1]];
  setZeroes(m1);
  assert.deepEqual(m1, [[1, 0, 1], [0, 0, 0], [1, 0, 1]]);

  const m2 = [[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]];
  setZeroes(m2);
  assert.deepEqual(m2, [[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]]);

  // Zero only in column 0 (not row 0)
  const m3 = [[1, 2], [0, 3]];
  setZeroes(m3);
  assert.deepEqual(m3, [[0, 2], [0, 0]]);
});
