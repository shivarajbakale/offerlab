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
export function searchMatrix(matrix: number[][], target: number): boolean {
  // @why How many rows there are.
  const rows = matrix.length;
  // @why How many columns; used to find each row's last value.
  const cols = matrix[0].length;

  // Find the candidate row.
  // @why `top` and `bot` are the rows that might hold the target.
  let top = 0;
  let bot = rows - 1;
  // @why Remember the row we pick; -1 means no row fits.
  let row = -1;
  // @why Binary search over rows.
  while (top <= bot) {
    // @why Check the middle row.
    const mid = (top + bot) >> 1;
    // @why Bigger than the row's last value, so the target must be in a lower row.
    if (target > matrix[mid][cols - 1]) top = mid + 1; // @ask top
    // @why Smaller than the row's first value, so the target must be in an upper row.
    else if (target < matrix[mid][0]) bot = mid - 1; // @ask bot
    else {
      // @why The target lies between this row's first and last value, so this is the only row it can be in.
      row = mid; // @moment row {mid} picked
      break;
    }
  }
  // @why No row can hold the target.
  if (row === -1) return false;

  // Search within that row.
  // @why Now binary search inside the chosen row.
  let lo = 0;
  let hi = cols - 1;
  // @why Keep going while columns remain to check.
  while (lo <= hi) {
    // @why Look at the middle column.
    const mid = (lo + hi) >> 1;
    // @why The value at that spot.
    const v = matrix[row][mid];
    // @why Found the target.
    if (v === target) return true;
    // @why Too small, so the target is to the right.
    if (v < target) lo = mid + 1; // @ask lo
    else hi = mid - 1;
  }
  // @why Not found in the row.
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
