/**
 * 74. Search a 2D Matrix
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/search-a-2d-matrix/
 *
 * You are given an m x n integer matrix where each row is sorted in
 * non-decreasing order and the first integer of each row is greater than the
 * last integer of the previous row. Given `target`, return true if it exists
 * in the matrix. The solution must run in O(log(m * n)) time.
 *
 * Example 1:
 *   Input: matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 3
 *   Output: true
 *
 * Example 2:
 *   Input: matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 13
 *   Output: false
 *
 * Constraints:
 *   m == matrix.length, n == matrix[i].length
 *   1 <= m, n <= 100
 *   -10^4 <= matrix[i][j], target <= 10^4
 *
 * Approach: Two binary searches
 *   First binary search over rows to find the single row whose range
 *   [row[0], row[n-1]] could contain the target, then binary search inside
 *   that row.
 *
 * Time: O(log m + log n)   Space: O(1)
 *
 * Pattern: binary-search
 * Key insight: Row ranges are disjoint and increasing, so the matrix behaves like one
 *   sorted list: first binary search for the only row whose range can hold the target,
 *   then search inside it.
 * Real world: Looking up a key in a paged sorted index, where you binary search page
 *   boundaries first and then within the chosen page.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz range:top..bot@mid
// @rule rows top..bot (then columns lo..hi) always contain the target if it is in the matrix
// @why The matrix is sorted row by row, so search the right row first, then inside it.
// @goal is {target} anywhere in this {matrix.length}×{matrix[0].length} sorted matrix?
export function searchMatrix(matrix: number[][], target: number): boolean {
  // @why How many rows there are.
  // @phase Setup: the matrix is one long sorted list folded into rows
  // @say Checking every cell is {matrix.length * matrix[0].length} comparisons. Each row starts above where the previous one ended, so a row's first and last values tell you whether the target can be in it: binary search the rows, then binary search inside one row.
  const rows = matrix.length;
  // @why How many columns; used to find each row's last value.
  const cols = matrix[0].length;

  // Find the candidate row.
  // @why `top` and `bot` are the rows that might hold the target.
  // @phase Find the only row that could hold the target
  let top = 0;
  let bot = rows - 1;
  // @why Remember the row we pick; -1 means no row fits.
  let row = -1;
  // @why Binary search over rows.
  // @yes {top === bot ? "Only row " + top + " is left, so check it." : "Rows " + top + ".." + bot + " could still hold " + target + ", so probe the middle one."}
  // @no No rows are left: {target} falls outside every row's range (or between two rows), so it is not in the matrix.
  while (top <= bot) {
    // @why Check the middle row.
    // @say Probe row {(top + bot) >> 1}{top === bot ? "" : ", the middle of rows " + top + ".." + bot}.
    const mid = (top + bot) >> 1;
    // @why Bigger than the row's last value, so the target must be in a lower row.
    // @say Row {mid} spans {matrix[mid][0]}..{matrix[mid][cols - 1]}.
    // @yes {target} > {matrix[mid][cols - 1]}, the largest value in row {mid}. Every row above it is smaller still, so drop rows up to {mid}.
    // @no {target} is not past the end of row {mid}, so rows below it (which start even higher) cannot hold it.
    if (target > matrix[mid][cols - 1]) top = mid + 1; // @ask top
    // @why Smaller than the row's first value, so the target must be in an upper row.
    // @yes {target} < {matrix[mid][0]}, the smallest value in row {mid}, so it can only be in an earlier row.
    // @no {matrix[mid][0]} ≤ {target} ≤ {matrix[mid][cols - 1]}: {target} falls inside row {mid}'s range, and no other row covers those values.
    else if (target < matrix[mid][0]) bot = mid - 1; // @ask bot
    else {
      // @why The target lies between this row's first and last value, so this is the only row it can be in.
      // @say Pick row {mid}. If {target} is anywhere, it is here.
      row = mid; // @moment row {mid} picked
      // @say Stop the row search; one row is all that is left to check.
      break;
    }
  }
  // @why No row can hold the target.
  // @yes No row's range contains {target}, so it cannot be in the matrix.
  // @no Row {row} is the only candidate. Now search inside it.
  // @returns false: {target} is outside every row's range.
  if (row === -1) return false;

  // Search within that row.
  // @why Now binary search inside the chosen row.
  // @phase Binary search inside row {row}
  // @say Row {row} is sorted too, so the same halving works on its {cols} columns.
  let lo = 0;
  let hi = cols - 1;
  // @why Keep going while columns remain to check.
  // @yes {lo === hi ? "Only column " + lo : "Columns " + lo + ".." + hi} of row {row} could still hold {target}.
  // @no The column range is empty, so {target} is not in row {row}, the only row that could have held it.
  while (lo <= hi) {
    // @why Look at the middle column.
    // @say Probe column {(lo + hi) >> 1}{lo === hi ? "" : ", the middle of " + lo + ".." + hi}.
    const mid = (lo + hi) >> 1;
    // @why The value at that spot.
    const v = matrix[row][mid];
    // @why Found the target.
    // @yes matrix[{row}][{mid}] is {v}, the target.
    // @no {v} is not {target}; compare to decide which half to keep.
    // @returns true: {target} sits at row {row}, column {mid}.
    if (v === target) return true;
    // @why Too small, so the target is to the right.
    // @yes {v} < {target}, so it and every column left of it are too small. Search right of column {mid}.
    // @no {v} > {target}, so it and every column right of it are too big. Search left of column {mid}.
    if (v < target) lo = mid + 1; // @ask lo
    else hi = mid - 1;
  }
  // @why Not found in the row.
  // @returns false: row {row} was the only place {target} could be, and it is not there.
  return false;
}

test("74. Search a 2D Matrix", () => {
  const m = [
    [1, 3, 5, 7],
    [10, 11, 16, 20],
    [23, 30, 34, 60],
  ];
  assert.equal(searchMatrix(m, 3), true);
  assert.equal(searchMatrix(m, 13), false);
  assert.equal(searchMatrix(m, 60), true);
  assert.equal(searchMatrix([[1]], 2), false);
});
