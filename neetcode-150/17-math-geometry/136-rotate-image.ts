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

// @rule rings outside l..r are fully rotated; each 4-cell swap moves its cells one corner clockwise
// @why Rotates the square matrix 90 degrees clockwise in place, with no extra grid.
// @goal how do you turn this {matrix.length}×{matrix.length} grid a quarter turn clockwise without a second grid?
export function rotate(matrix: number[][]): void {
  // @why `l` is the left edge of the current outer ring.
  // @phase Setup: the outermost ring
  // @say Copying into a fresh grid is easy but costs n² extra space. In place, a quarter turn only ever moves a cell to another cell on the same ring, and every cell is in a group of four that trade places. So rotate ring by ring, four cells at a time, holding just one value aside.
  let l = 0;
  // @why `r` is the right edge of the ring; it is also the top and bottom edge since the matrix is square.
  let r = matrix.length - 1;
  // @why Work ring by ring, from the outside in, until nothing is left to rotate.
  // @phase Ring by ring, from the outside in
  // @yes The ring from {l} to {r} is {r - l + 1} wide, so it still has cells that move.
  // @no {l === r ? "Only the centre cell " + matrix[l][l] + " is left, and a quarter turn leaves it where it is." : "No ring is left: every cell has moved."}
  while (l < r) {
    // @why Each step moves one group of four cells; a ring needs `r - l` of them.
    // @yes Group {i + 1} of {r - l} on this ring: the four cells {i === 0 ? "at the corners" : i + (i === 1 ? " step" : " steps") + " clockwise from each corner"}.
    // @no {r - l === 1 ? "The one group" : "All " + (r - l) + " groups"} of four on the ring {l}..{r} {r - l === 1 ? "has" : "have"} turned. Each cell moved exactly once.
    for (let i = 0; i < r - l; i++) {
      // @why The top row index of this ring.
      const top = l;
      // @why The bottom row index of this ring.
      const bottom = r;
      // @why Save one cell, because it is about to be overwritten.
      // @say Hold {matrix[top][l + i]} aside. The next line writes over its spot, and it is the one value the cycle would otherwise lose.
      const topLeft = matrix[top][l + i]; // save top-left

      // @why Rotate four cells at once: each spot takes the value of the spot counter-clockwise from it.
      // @say Going clockwise, the left side moves up to the top: {matrix[bottom - i][l]} takes {topLeft}'s place.
      matrix[top][l + i] = matrix[bottom - i][l]; // @ask matrix[top][l+i] // bottom-left -> top-left
      // @why The bottom-right value moves left into the bottom-left spot.
      // @say The bottom side moves to the left: {matrix[bottom][r - i]} fills the spot just emptied.
      matrix[bottom - i][l] = matrix[bottom][r - i]; // bottom-right -> bottom-left
      // @why The top-right value moves down into the bottom-right spot.
      // @say The right side moves down to the bottom: {matrix[top + i][r]} fills the spot just emptied.
      matrix[bottom][r - i] = matrix[top + i][r]; // top-right -> bottom-right
      // @why The saved top-left value finishes the cycle.
      // @say The held {topLeft} lands on the right side, closing the cycle of four.
      // @then These four cells sit a quarter turn from where they started, using one spare variable.
      matrix[top + i][r] = topLeft; // @moment 4-cycle done at offset {i} // top-left -> top-right
    }
    // @why Move to the next ring in: shrink from the left.
    // @say The ring {l}..{r} is fully turned. Step inward to the next ring.
    l++; // @moment ring {l} rotated
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
