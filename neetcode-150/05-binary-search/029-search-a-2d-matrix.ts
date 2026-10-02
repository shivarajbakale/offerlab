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

export function searchMatrix(matrix: number[][], target: number): boolean {
  const rows = matrix.length;
  const cols = matrix[0].length;

  // Find the candidate row.
  let top = 0;
  let bot = rows - 1;
  let row = -1;
  while (top <= bot) {
    const mid = (top + bot) >> 1;
    if (target > matrix[mid][cols - 1]) top = mid + 1;
    else if (target < matrix[mid][0]) bot = mid - 1;
    else {
      row = mid;
      break;
    }
  }
  if (row === -1) return false;

  // Search within that row.
  let lo = 0;
  let hi = cols - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = matrix[row][mid];
    if (v === target) return true;
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
  }
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
