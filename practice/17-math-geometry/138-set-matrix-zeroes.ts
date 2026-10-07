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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function setZeroes(matrix: number[][]): void {
  // TODO: implement
  throw new Error("Not implemented");
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
