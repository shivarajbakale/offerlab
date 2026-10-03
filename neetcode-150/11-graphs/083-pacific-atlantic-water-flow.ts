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
 *
 * Pattern: grid-dfs
 * Key insight: Asking "where does water from each cell go" repeats the same work for
 *   every cell. Running it backwards (from each ocean's border, only climbing to cells at
 *   least as high) finds every cell that drains there in one O(m * n) sweep per ocean.
 * Real world: Hydrology tools computing watersheds from a digital elevation model,
 *   tracing uphill from each river outlet to find every cell that drains into it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns every cell whose rain can flow to both oceans.
export function pacificAtlantic(heights: number[][]): number[][] {
  // @why Save the grid size once for the bounds check.
  const rows = heights.length;
  const cols = heights[0].length;
  // @why Cells that can drain into the Pacific.
  const pac = new Set<number>();
  // @why Cells that can drain into the Atlantic.
  const atl = new Set<number>();

  // @why Walk uphill from an ocean edge, marking every cell that can drain into that ocean.
  const dfs = (r: number, c: number, seen: Set<number>, prev: number): void => {
    // @why Turn (r, c) into one number so it fits in a Set.
    const key = r * cols + c;
    // @why Stop at the grid edge.
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    // @why Skip cells already marked, and cells lower than where we came from (water can't flow up).
    if (seen.has(key) || heights[r][c] < prev) return;
    // @why This cell can reach the ocean we started from.
    seen.add(key);
    // @why Remember this height as the new minimum for the next step uphill.
    const h = heights[r][c];
    // @why Try all four neighbours; only equal or higher ones will pass.
    dfs(r + 1, c, seen, h);
    dfs(r - 1, c, seen, h);
    dfs(r, c + 1, seen, h);
    dfs(r, c - 1, seen, h);
  };

  // @why Top row touches the Pacific and bottom row touches the Atlantic.
  for (let c = 0; c < cols; c++) {
    // @why Start from the top edge for the Pacific.
    dfs(0, c, pac, heights[0][c]);
    // @why Start from the bottom edge for the Atlantic.
    dfs(rows - 1, c, atl, heights[rows - 1][c]);
  }
  // @why Left column touches the Pacific and right column touches the Atlantic.
  for (let r = 0; r < rows; r++) {
    // @why Start from the left edge for the Pacific.
    dfs(r, 0, pac, heights[r][0]);
    // @why Start from the right edge for the Atlantic.
    dfs(r, cols - 1, atl, heights[r][cols - 1]);
  }

  // @why Collects the cells that reach both oceans.
  const result: number[][] = [];
  // @why Check every cell against both sets.
  for (let r = 0; r < rows; r++) {
    // @why Go through each column of this row.
    for (let c = 0; c < cols; c++) {
      // @why Same cell id used when marking.
      const key = r * cols + c;
      // @why Only cells in both sets can reach both oceans.
      if (pac.has(key) && atl.has(key)) result.push([r, c]);
    }
  }
  // @why All cells that drain to both oceans.
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
