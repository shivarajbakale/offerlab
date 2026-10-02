/**
 * 417. Pacific Atlantic Water Flow
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/pacific-atlantic-water-flow/
 *
 * An m x n island borders the Pacific Ocean on its top and left edges and
 * the Atlantic Ocean on its bottom and right edges. `heights[r][c]` is the
 * height of each cell. Rain water flows from a cell to a 4-directional
 * neighbor whose height is less than or equal to the current one, and from
 * any edge cell into the adjacent ocean. Return all coordinates [r, c] from
 * which water can reach both oceans (in any order).
 *
 * Example 1:
 *   Input: heights = [
 *     [1,2,2,3,5],
 *     [3,2,3,4,4],
 *     [2,4,5,3,1],
 *     [6,7,1,4,5],
 *     [5,1,1,2,4]
 *   ]
 *   Output: [[0,4],[1,3],[1,4],[2,2],[3,0],[3,1],[4,0]]
 *
 * Example 2:
 *   Input: heights = [[1]]
 *   Output: [[0,0]]
 *
 * Constraints:
 *   1 <= m, n <= 200
 *   0 <= heights[r][c] <= 10^5
 *
 * Approach: Reverse DFS from each ocean
 *   Instead of asking where water from each cell goes, start at each ocean's
 *   border and walk "uphill" (to neighbors with height >= current). That
 *   marks every cell that can drain into that ocean. Answer = intersection.
 *
 * Time: O(m * n)   Space: O(m * n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function pacificAtlantic(heights: number[][]): number[][] {
  const rows = heights.length;
  const cols = heights[0].length;
  const pac = new Set<number>();
  const atl = new Set<number>();

  const dfs = (r: number, c: number, seen: Set<number>, prev: number): void => {
    const key = r * cols + c;
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    if (seen.has(key) || heights[r][c] < prev) return;
    seen.add(key);
    const h = heights[r][c];
    dfs(r + 1, c, seen, h);
    dfs(r - 1, c, seen, h);
    dfs(r, c + 1, seen, h);
    dfs(r, c - 1, seen, h);
  };

  for (let c = 0; c < cols; c++) {
    dfs(0, c, pac, heights[0][c]);
    dfs(rows - 1, c, atl, heights[rows - 1][c]);
  }
  for (let r = 0; r < rows; r++) {
    dfs(r, 0, pac, heights[r][0]);
    dfs(r, cols - 1, atl, heights[r][cols - 1]);
  }

  const result: number[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = r * cols + c;
      if (pac.has(key) && atl.has(key)) result.push([r, c]);
    }
  }
  return result;
}

const sorted = (cells: number[][]): number[][] =>
  [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

test("417. Pacific Atlantic Water Flow", () => {
  assert.deepEqual(
    sorted(
      pacificAtlantic([
        [1, 2, 2, 3, 5],
        [3, 2, 3, 4, 4],
        [2, 4, 5, 3, 1],
        [6, 7, 1, 4, 5],
        [5, 1, 1, 2, 4],
      ]),
    ),
    [[0, 4], [1, 3], [1, 4], [2, 2], [3, 0], [3, 1], [4, 0]],
  );
  assert.deepEqual(pacificAtlantic([[1]]), [[0, 0]]);
  assert.deepEqual(sorted(pacificAtlantic([[1, 1], [1, 1]])), [[0, 0], [0, 1], [1, 0], [1, 1]]);
});
