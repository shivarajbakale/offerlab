/**
 * 54. Spiral Matrix
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/spiral-matrix/
 *
 * Given an m x n `matrix`, return all of its elements in spiral order:
 * left-to-right along the top, down the right side, right-to-left along the
 * bottom, up the left side, then repeat on the inner rectangle.
 *
 * Example 1:
 *   Input: matrix = [[1,2,3],[4,5,6],[7,8,9]]
 *   Output: [1,2,3,6,9,8,7,4,5]
 *
 * Example 2:
 *   Input: matrix = [[1,2,3,4],[5,6,7,8],[9,10,11,12]]
 *   Output: [1,2,3,4,8,12,11,10,9,5,6,7]
 *
 * Constraints:
 *   1 <= m, n <= 10
 *   -100 <= matrix[i][j] <= 100
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function spiralOrder(matrix: number[][]): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("54. Spiral Matrix", () => {
  assert.deepEqual(spiralOrder([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), [1, 2, 3, 6, 9, 8, 7, 4, 5]);
  assert.deepEqual(
    spiralOrder([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]),
    [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7],
  );
  assert.deepEqual(spiralOrder([[1], [2], [3]]), [1, 2, 3]);
  assert.deepEqual(spiralOrder([[1, 2, 3]]), [1, 2, 3]);
});
