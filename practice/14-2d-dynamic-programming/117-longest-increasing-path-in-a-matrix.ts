/**
 * 329. Longest Increasing Path in a Matrix
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/longest-increasing-path-in-a-matrix/
 *
 * Given an m x n integer matrix, return the length of the longest strictly
 * increasing path. From each cell you may move up, down, left or right (no
 * diagonals, no wrap-around).
 *
 * Example 1:
 *   Input: matrix = [[9,9,4],[6,6,8],[2,1,1]]
 *   Output: 4   (1 -> 2 -> 6 -> 9)
 *
 * Example 2:
 *   Input: matrix = [[3,4,5],[3,2,6],[2,2,1]]
 *   Output: 4   (3 -> 4 -> 5 -> 6)
 *
 * Example 3:
 *   Input: matrix = [[1]]
 *   Output: 1
 *
 * Constraints:
 *   1 <= m, n <= 200
 *   0 <= matrix[i][j] <= 2^31 - 1
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestIncreasingPath(matrix: number[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("329. Longest Increasing Path in a Matrix", () => {
  assert.equal(longestIncreasingPath([[9, 9, 4], [6, 6, 8], [2, 1, 1]]), 4);
  assert.equal(longestIncreasingPath([[3, 4, 5], [3, 2, 6], [2, 2, 1]]), 4);
  assert.equal(longestIncreasingPath([[1]]), 1);
  assert.equal(longestIncreasingPath([[7, 7], [7, 7]]), 1);
  assert.equal(longestIncreasingPath([[1, 2, 3], [6, 5, 4], [7, 8, 9]]), 9);
});
