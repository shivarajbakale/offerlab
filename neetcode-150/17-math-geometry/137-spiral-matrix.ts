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
// @goal what are the values of {JSON.stringify(matrix)} read in a clockwise spiral from the top-left?
export function spiralOrder(matrix: number[][]): number[] {
  // @why The values we collect, in order.
  // @phase Setup: four walls around the unread rectangle
  // @say Simulating a walker with a visited grid works, but needs n·m extra memory and turn logic. The unread cells always form a rectangle, so four walls describe them exactly: read one edge, then move that wall in.
  const res: number[] = [];
  // @why `top` is the first row not yet visited.
  let top = 0;
  // @why `bottom` is one past the last row not yet visited.
  // @say Walls start at the grid's edges: rows 0..{matrix.length - 1}, columns 0..{matrix[0].length - 1}. Bottom and right sit one past the last unread row and column.
  let bottom = matrix.length; // exclusive
  // @why `left` is the first column not yet visited.
  let left = 0;
  // @why `right` is one past the last column not yet visited.
  let right = matrix[0].length; // exclusive

  // @why Keep peeling layers while there is still a non-empty rectangle left.
  // @phase Peel one layer: top, right, bottom, left
  // @yes Rows {top}..{bottom - 1} and columns {left}..{right - 1} are still unread.
  // @no The walls have met: no unread cells remain.
  while (top < bottom && left < right) {
    // @why Go right along the top row.
    // @yes Top row {top}, column {c}: read {matrix[top][c]}.
    // @no The top row is read, ending at column {right - 1}.
    // @say Read the top row left to right, columns {left}..{right - 1}.
    for (let c = left; c < right; c++) res.push(matrix[top][c]);
    // @why That row is done, so the top edge moves down.
    // @say Row {top} is fully read, so the top wall moves down to {top + 1}.
    top++; // @ask res.length
    // @why Go down the right column.
    // @yes Right column {right - 1}, row {r}: read {matrix[r][right - 1]}.
    // @no The right column is read{top < bottom ? " down to row " + (bottom - 1) : "; there were no rows left under the top"}.
    // @say Read the right column top to bottom, rows {top}..{bottom - 1}.
    for (let r = top; r < bottom; r++) res.push(matrix[r][right - 1]);
    // @why That column is done, so the right edge moves left.
    // @say Column {right - 1} is fully read, so the right wall moves in: the last unread column is now {right - 2}.
    right--; // @ask right
    // @why The shrinking could leave nothing (a single row or column). Stop so we do not repeat cells.
    // @yes The walls crossed: {top >= bottom ? "no rows" : "no columns"} are left. Walking the bottom or left edge now would re-read cells already taken.
    // @no Rows {top}..{bottom - 1} and columns {left}..{right - 1} remain, so the bottom row and left column are new cells.
    if (!(top < bottom && left < right)) break;
    // @why Go left along the bottom row.
    // @yes Bottom row {bottom - 1}, column {c}: read {matrix[bottom - 1][c]}.
    // @no The bottom row is read back to column {left}.
    // @say Read the bottom row right to left, columns {right - 1} down to {left}.
    for (let c = right - 1; c >= left; c--) res.push(matrix[bottom - 1][c]);
    // @why That row is done, so the bottom edge moves up.
    // @say Row {bottom - 1} is fully read, so the bottom wall moves up.
    bottom--; // @ask res.length
    // @why Go up the left column.
    // @yes Left column {left}, row {r}: read {matrix[r][left]}.
    // @no The left column is read{bottom > top ? " up to row " + top : "; nothing was left between the walls"}.
    // @say Read the left column bottom to top, rows {bottom - 1} up to {top}.
    for (let r = bottom - 1; r >= top; r--) res.push(matrix[r][left]);
    // @why That column is done, so the left edge moves right.
    // @say Column {left} is fully read, so the left wall moves right.
    // @then One full layer peeled. Read so far: {JSON.stringify(res)}.
    left++;
  }
  // @why All cells have been collected.
  // @phase Answer
  // @returns {JSON.stringify(res)}: every cell read exactly once, O(rows × cols) time.
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
