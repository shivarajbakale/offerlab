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

// @rule dp[r][c] is the longest increasing path starting at cell (r, c), or 0 if not solved yet
// @why Returns the length of the longest path that moves up, down, left or right through strictly bigger numbers.
// @goal how long is the longest strictly increasing path in {JSON.stringify(matrix)}?
export function longestIncreasingPath(matrix: number[][]): number {
  // @why Number of rows.
  // @phase Setup: a memo cell for every starting point
  // @say Walking every path from every cell is exponential, since paths branch at each step. But the longest climb from a cell never depends on how you got there, so each cell's answer can be computed once and reused by every path that passes through it.
  const rows = matrix.length;
  // @why Number of columns.
  const cols = matrix[0].length;
  // @why `dp[r][c]` means the longest increasing path starting at cell `(r, c)`; 0 means not computed yet.
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  // @why The four moves we may take.
  // @say Moves are only up, down, left and right, so every cell has at most four places to go next.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // @why Computes `dp[r][c]` on demand (memoized DFS); no cycles since values must strictly increase.
  // @goal how long is the longest increasing path that starts at ({r}, {c}), value {matrix[r][c]}?
  const dfs = (r: number, c: number): number => {
    // @why Already solved this cell, so reuse it instead of searching again.
    // @phase Climb: try every bigger neighbour, keep the longest
    // @yes ({r}, {c}) was solved earlier: {dp[r][c]}. A path from here can't depend on the route in, so the old answer still holds.
    // @no ({r}, {c}) hasn't been solved yet, so look at its neighbours.
    // @returns {dp[r][c]}: the cached longest climb from ({r}, {c}), reused instead of searched again.
    if (dp[r][c] !== 0) return dp[r][c];
    // @why A path of just this cell has length 1.
    // @say Start with 1: the path that is just {matrix[r][c]} itself, in case no neighbour is bigger.
    let best = 1;
    // @why Try each of the four neighbours.
    // @say Check the four neighbours of {matrix[r][c]} in turn; any bigger one can extend the climb.
    for (const [dr, dc] of dirs) {
      // @why Row of the neighbour.
      // @say Look {dr === 1 ? "down" : dr === -1 ? "up" : dc === 1 ? "right" : "left"}: the neighbour sits in row {r + dr}.
      const nr = r + dr;
      // @why Column of the neighbour.
      // @say And in column {c + dc}, so the candidate is ({nr}, {c + dc}). It still has to be on the grid and bigger.
      const nc = c + dc;
      // @why The neighbour must be on the grid and bigger, so the path keeps increasing.
      // @yes ({nr}, {nc}) holds {matrix[nr][nc]}, bigger than {matrix[r][c]}, so the climb can continue there. Because values only go up, it can never loop back here.
      // @no {nr < 0 || nr >= rows || nc < 0 || nc >= cols ? "(" + nr + ", " + nc + ") is off the grid." : "(" + nr + ", " + nc + ") holds " + matrix[nr][nc] + ", not bigger than " + matrix[r][c] + ", so the path can't step there."}
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && matrix[nr][nc] > matrix[r][c]) {
        // @why Step to the neighbour: this cell plus the longest path from there.
        // @say Ask how far the climb goes from {matrix[nr][nc]}, then add 1 for the step from {matrix[r][c]}.
        // @then Through ({nr}, {nc}): 1 + {dp[nr][nc]} = {1 + dp[nr][nc]}. Best from ({r}, {c}) so far: {best}.
        best = Math.max(best, 1 + dfs(nr, nc));
      }
    }
    // @why Save the answer so this cell is never solved twice.
    // @say All four directions are checked, so {best} is final for ({r}, {c}). Cache it: other cells' paths may run through here.
    dp[r][c] = best; // @ask dp[r][c] // @moment solved ({r},{c}) = {best}
    // @why Longest path starting here.
    // @returns {best}: the longest climb starting at {matrix[r][c]}, counting this cell.
    return best;
  };

  // @why Best path found over all starting cells.
  // @phase Try every cell as a starting point
  let res = 0;
  // @why The best path may start anywhere, so try every row.
  // @yes Row {r}: try each of its cells as a start.
  // @no Every cell has been a start. Thanks to the memo each was solved only once, so this is O(rows x cols).
  for (let r = 0; r < rows; r++) {
    // @why Try every column; `dfs` is cheap thanks to memo.
    // @yes Start at ({r}, {c}), value {matrix[r][c]}. {dp[r][c] ? "Already solved: " + dp[r][c] + "." : "Not solved yet, so search from it."}
    // @no Row {r} is done; best path so far: {res}.
    // @say Get the longest climb from ({r}, {c}) and keep it if it beats {res}.
    for (let c = 0; c < cols; c++) res = Math.max(res, dfs(r, c));
  }
  // @why The longest increasing path overall.
  // @phase Answer
  // @returns {res}: the longest climb from any starting cell.
  return res;
}

test("329. Longest Increasing Path in a Matrix", () => {
  assert.equal(longestIncreasingPath([[9, 9, 4], [6, 6, 8], [2, 1, 1]]), 4);
  assert.equal(longestIncreasingPath([[3, 4, 5], [3, 2, 6], [2, 2, 1]]), 4);
  assert.equal(longestIncreasingPath([[1]]), 1);
  assert.equal(longestIncreasingPath([[7, 7], [7, 7]]), 1);
  assert.equal(longestIncreasingPath([[1, 2, 3], [6, 5, 4], [7, 8, 9]]), 9);
});
