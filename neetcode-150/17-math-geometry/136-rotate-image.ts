/**
 * 48. Rotate Image
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/rotate-image/
 *
 * Given an n x n 2D `matrix` representing an image, rotate it by 90 degrees
 * clockwise. The rotation must be done in place: modify the input matrix
 * directly without allocating another 2D matrix.
 *
 * Example 1:
 *   Input: matrix = [[1,2,3],[4,5,6],[7,8,9]]
 *   Output: [[7,4,1],[8,5,2],[9,6,3]]
 *
 * Example 2:
 *   Input: matrix = [[5,1,9,11],[2,4,8,10],[13,3,6,7],[15,14,12,16]]
 *   Output: [[15,13,2,5],[14,3,4,1],[12,6,8,9],[16,7,10,11]]
 *
 * Constraints:
 *   n == matrix.length == matrix[i].length
 *   1 <= n <= 20
 *   -1000 <= matrix[i][j] <= 1000
 *
 * Approach: Rotate layer by layer (four-way swap)
 *   Process concentric square layers from the outside in. For each offset i
 *   along a layer, cycle the four corresponding cells:
 *   top-left -> top-right -> bottom-right -> bottom-left -> top-left,
 *   using a single temporary variable.
 *
 * Time: O(n^2)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function rotate(matrix: number[][]): void {
  let l = 0;
  let r = matrix.length - 1;
  while (l < r) {
    for (let i = 0; i < r - l; i++) {
      const top = l;
      const bottom = r;
      const topLeft = matrix[top][l + i]; // save top-left

      matrix[top][l + i] = matrix[bottom - i][l]; // bottom-left -> top-left
      matrix[bottom - i][l] = matrix[bottom][r - i]; // bottom-right -> bottom-left
      matrix[bottom][r - i] = matrix[top + i][r]; // top-right -> bottom-right
      matrix[top + i][r] = topLeft; // top-left -> top-right
    }
    l++;
    r--;
  }
}

test("48. Rotate Image", () => {
  const m1 = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  rotate(m1);
  assert.deepEqual(m1, [[7, 4, 1], [8, 5, 2], [9, 6, 3]]);

  const m2 = [[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]];
  rotate(m2);
  assert.deepEqual(m2, [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]]);

  const m3 = [[1]];
  rotate(m3);
  assert.deepEqual(m3, [[1]]);
});
