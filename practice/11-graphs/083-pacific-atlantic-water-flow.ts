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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function pacificAtlantic(heights: number[][]): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
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
