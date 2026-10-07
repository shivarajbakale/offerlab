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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function searchMatrix(matrix: number[][], target: number): boolean {
  // TODO: implement
  throw new Error("Not implemented");
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
