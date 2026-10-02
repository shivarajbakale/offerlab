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
 *
 * Approach: DFS with memoization
 *   State: dp[r][c] = length of the longest increasing path starting at
 *   (r, c).
 *   Recurrence: dp[r][c] = 1 + max(dp[nr][nc]) over neighbours with a
 *   strictly larger value (or 1 if none).
 *   Strict increase means no cycles, so plain memoised DFS is safe. Each
 *   cell is computed once.
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: memoized-dfs
 * Key insight: Moves only go to strictly larger values, so no path can revisit a cell and
 *   the grid is a DAG. That makes the longest path from a cell a fixed number, so it can
 *   be cached and every cell is solved exactly once.
 * Real world: A terrain tool finding the longest strictly uphill hiking route on an
 *   elevation map, where each cell's best climb is reused by every route that passes
 *   through it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestIncreasingPath(matrix: number[][]): number {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const dfs = (r: number, c: number): number => {
    if (dp[r][c] !== 0) return dp[r][c];
    let best = 1;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && matrix[nr][nc] > matrix[r][c]) {
        best = Math.max(best, 1 + dfs(nr, nc));
      }
    }
    dp[r][c] = best;
    return best;
  };

  let res = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) res = Math.max(res, dfs(r, c));
  }
  return res;
}

test("329. Longest Increasing Path in a Matrix", () => {
  assert.equal(longestIncreasingPath([[9, 9, 4], [6, 6, 8], [2, 1, 1]]), 4);
  assert.equal(longestIncreasingPath([[3, 4, 5], [3, 2, 6], [2, 2, 1]]), 4);
  assert.equal(longestIncreasingPath([[1]]), 1);
  assert.equal(longestIncreasingPath([[7, 7], [7, 7]]), 1);
  assert.equal(longestIncreasingPath([[1, 2, 3], [6, 5, 4], [7, 8, 9]]), 9);
});
