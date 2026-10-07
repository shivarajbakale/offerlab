/**
 * 62. Unique Paths
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/unique-paths/
 *
 * A robot starts at the top-left corner of an m x n grid and wants to reach
 * the bottom-right corner. It can only move right or down. Return the number
 * of distinct paths it can take.
 *
 * Example 1:
 *   Input: m = 3, n = 7
 *   Output: 28
 *
 * Example 2:
 *   Input: m = 3, n = 2
 *   Output: 3   (R-D-D, D-D-R, D-R-D)
 *
 * Constraints:
 *   1 <= m, n <= 100
 *   The answer is at most 2 * 10^9.
 *
 * Approach: Bottom-up DP, one row at a time
 *   State: dp[r][c] = number of paths from (r, c) to the bottom-right.
 *   Recurrence: dp[r][c] = dp[r + 1][c] + dp[r][c + 1]; the last row and
 *   last column are all 1.
 *   Keep a single row: row[c] holds the row below, and we update it in place
 *   right to left so row[c + 1] is already the current row's value.
 *
 * Time: O(m * n)   Space: O(n)
 *
 * Pattern: dp-grid
 * Key insight: Paths to a cell come only from the cell to its right or below, so its
 *   count is their sum. One row array is enough because updating right to left keeps the
 *   row below and the current row in the same array.
 * Real world: Counting lattice paths in a robot or routing grid, for example estimating
 *   the number of shortest routes through a city street grid.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule row[c] is the number of paths from cell (r, c) down to the bottom-right corner
// @why Returns how many paths lead from top-left to bottom-right moving only right or down.
// @goal how many right/down paths cross a {m} x {n} grid from top-left to bottom-right?
export function uniquePaths(m: number, n: number): number {
  // @why One row of the grid: `row[c]` means paths from the current row's cell `c` to the goal; the bottom row has 1 path each.
  // @phase Setup: the bottom row, where the answer is obvious
  // @say Listing every path is exponential. But the paths from a cell are just the paths from the cell below plus the paths from the cell to its right, so one row of counts is enough. On the bottom row you can only go right: exactly 1 path from each of its {n} cells.
  const row = new Array<number>(n).fill(1);
  // @why Move up one row at a time; the bottom row is already filled.
  // @phase Climb row by row: each cell adds its two ways out
  // @yes Row {r} is next. The array still holds the counts for row {r + 1}, which is exactly the "go down" option for every cell of row {r}.
  // @no {m === 1 ? "There is only one row, so the bottom row is the whole grid." : "Row 0 is done, so the array now holds the top row's counts."}
  for (let r = m - 2; r >= 0; r--) {
    // @why Go right to left so `row[c + 1]` is already updated for this row.
    // @yes Cell ({r}, {c}). Its right neighbour was updated a moment ago, so it already counts paths on row {r}.
    // @no Row {r} is finished. The last column stays 1: from there you can only go straight down.
    for (let c = n - 2; c >= 0; c--) {
      // @why Paths from a cell = paths going down (old `row[c]`) + paths going right (`row[c + 1]`).
      // @say Every path from ({r}, {c}) starts by going down or right, never both, so add the two counts: {row[c]} down + {row[c + 1]} right = {row[c] + row[c + 1]}.
      row[c] += row[c + 1]; // @ask row[c]
    }
  }
  // @why Top-left cell holds the total paths.
  // @phase Answer
  // @returns {row[0]}: the count for the top-left cell, built from about m x n additions instead of listing paths.
  return row[0];
}

test("62. Unique Paths", () => {
  assert.equal(uniquePaths(3, 7), 28);
  assert.equal(uniquePaths(3, 2), 3);
  assert.equal(uniquePaths(1, 1), 1);
  assert.equal(uniquePaths(1, 10), 1);
});
