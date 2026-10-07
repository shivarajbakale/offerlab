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
 *
 * Approach: Shrinking boundaries
 *   Keep four bounds: top, bottom, left, right. Walk the top row, then the
 *   right column, shrinking each bound after use. Before walking the bottom
 *   row and left column, check the bounds still form a valid rectangle (this
 *   handles single remaining rows/columns).
 *
 * Time: O(m * n)   Space: O(1) (excluding output)
 *
 * Pattern: matrix-simulation
 * Key insight: Each full side you walk is never visited again, so shrink that boundary
 *   right after walking it. Re-checking the bounds before the bottom row and left column
 *   stops a single leftover row or column from being read twice.
 * Real world: Printing or scanning a grid in spiral order, as in an LED matrix animation
 *   or a spiral search pattern for a camera or drone sweep.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule res holds every cell outside rows top..bottom-1 and cols left..right-1, in spiral order
// @why Returns every matrix value in spiral order, starting at the top-left going right.
export function spiralOrder(matrix: number[][]): number[] {
  // @why The values we collect, in order.
  const res: number[] = [];
  // @why `top` is the first row not yet visited.
  let top = 0;
  // @why `bottom` is one past the last row not yet visited.
  let bottom = matrix.length; // exclusive
  // @why `left` is the first column not yet visited.
  let left = 0;
  // @why `right` is one past the last column not yet visited.
  let right = matrix[0].length; // exclusive

  // @why Keep peeling layers while there is still a non-empty rectangle left.
  while (top < bottom && left < right) {
    // @why Go right along the top row.
    for (let c = left; c < right; c++) res.push(matrix[top][c]);
    // @why That row is done, so the top edge moves down.
    top++; // @ask res.length
    // @why Go down the right column.
    for (let r = top; r < bottom; r++) res.push(matrix[r][right - 1]);
    // @why That column is done, so the right edge moves left.
    right--; // @ask right
    // @why The shrinking could leave nothing (a single row or column). Stop so we do not repeat cells.
    if (!(top < bottom && left < right)) break;
    // @why Go left along the bottom row.
    for (let c = right - 1; c >= left; c--) res.push(matrix[bottom - 1][c]);
    // @why That row is done, so the bottom edge moves up.
    bottom--; // @ask res.length
    // @why Go up the left column.
    for (let r = bottom - 1; r >= top; r--) res.push(matrix[r][left]);
    // @why That column is done, so the left edge moves right.
    left++;
  }
  // @why All cells have been collected.
  return res;
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
