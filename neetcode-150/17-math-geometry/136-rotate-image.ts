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
 *
 * Pattern: matrix-simulation
 * Key insight: A 90-degree turn moves every cell in a closed cycle of four positions
 *   within the same ring. Rotating those four cells together with one temp value needs no
 *   extra matrix.
 * Real world: Image editors and phone galleries rotate photos in place this way to avoid
 *   allocating a second full-size buffer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Rotates the square matrix 90 degrees clockwise in place, with no extra grid.
export function rotate(matrix: number[][]): void {
  // @why `l` is the left edge of the current outer ring.
  let l = 0;
  // @why `r` is the right edge of the ring; it is also the top and bottom edge since the matrix is square.
  let r = matrix.length - 1;
  // @why Work ring by ring, from the outside in, until nothing is left to rotate.
  while (l < r) {
    // @why Each step moves one group of four cells; a ring needs `r - l` of them.
    for (let i = 0; i < r - l; i++) {
      // @why The top row index of this ring.
      const top = l;
      // @why The bottom row index of this ring.
      const bottom = r;
      // @why Save one cell, because it is about to be overwritten.
      const topLeft = matrix[top][l + i]; // save top-left

      // @why Rotate four cells at once: each spot takes the value of the spot counter-clockwise from it.
      matrix[top][l + i] = matrix[bottom - i][l]; // bottom-left -> top-left
      // @why The bottom-right value moves left into the bottom-left spot.
      matrix[bottom - i][l] = matrix[bottom][r - i]; // bottom-right -> bottom-left
      // @why The top-right value moves down into the bottom-right spot.
      matrix[bottom][r - i] = matrix[top + i][r]; // top-right -> bottom-right
      // @why The saved top-left value finishes the cycle.
      matrix[top + i][r] = topLeft; // top-left -> top-right
    }
    // @why Move to the next ring in: shrink from the left.
    l++;
    // @why And shrink from the right.
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
