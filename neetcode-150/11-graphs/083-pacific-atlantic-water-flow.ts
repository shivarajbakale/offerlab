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

// @rule pac and atl hold every cell found so far that can drain into that ocean
// @why Returns every cell whose rain can flow to both oceans.
// @goal which cells of this {heights.length}×{heights[0].length} map can drain into both the Pacific and the Atlantic?
export function pacificAtlantic(heights: number[][]): number[][] {
  // @why Save the grid size once for the bounds check.
  // @phase Setup: one set of draining cells per ocean
  // @say Following the water downhill from every cell repeats the same paths again and again: O((m·n)²). Run it backwards instead: start at each ocean's shore and climb uphill. Every cell reached that way drains into that ocean.
  const rows = heights.length;
  const cols = heights[0].length;
  // @why Cells that can drain into the Pacific.
  const pac = new Set<number>();
  // @why Cells that can drain into the Atlantic.
  const atl = new Set<number>();

  // @why Walk uphill from an ocean edge, marking every cell that can drain into that ocean.
  // @phase Climb uphill from a shore cell
  // @goal does water at ({r},{c}) reach this climb's ocean, by flowing down to a neighbour {prev} high?
  const dfs = (r: number, c: number, seen: Set<number>, prev: number): void => {
    // @why Turn (r, c) into one number so it fits in a Set.
    // @say Name cell ({r},{c}) by one number, {r} × {cols} + {c} = {r * cols + c}, so a Set can hold it.
    const key = r * cols + c;
    // @why Stop at the grid edge.
    // @yes ({r},{c}) is off the map, so there is no cell to climb to.
    // @no ({r},{c}) is on the map.
    // @returns nothing; this direction leaves the map.
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    // @why Skip cells already marked, and cells lower than where we came from (water can't flow up).
    // @yes {seen.has(key) ? "(" + r + "," + c + ") is already marked for this ocean, so everything uphill of it is covered too." : "(" + r + "," + c + ") has height " + heights[r][c] + ", lower than " + prev + ". Water there can't flow up to the cell we came from, so it does not reach the ocean this way."}
    // @no ({r},{c}) has height {heights[r][c]}, at least {prev}, so water there can flow down to the cell we came from, and on to the ocean.
    // @returns nothing; the climb stops here.
    if (seen.has(key) || heights[r][c] < prev) return;
    // @why This cell can reach the ocean we started from.
    // @say Mark ({r},{c}): it drains into this ocean. Marking it also stops any later climb from walking it again.
    seen.add(key); // @ask seen.size
    // @why Remember this height as the new minimum for the next step uphill.
    // @say Height {heights[r][c]} is the new floor: a neighbour drains through ({r},{c}) only if it is at least this high.
    const h = heights[r][c];
    // @why Try all four neighbours; only equal or higher ones will pass.
    // @say Try the cell below, ({r + 1},{c}): it joins only if it is at least {h} high.
    dfs(r + 1, c, seen, h);
    // @say Try the cell above, ({r - 1},{c}).
    dfs(r - 1, c, seen, h);
    // @say Try the cell to the right, ({r},{c + 1}).
    dfs(r, c + 1, seen, h);
    // @say Last, the cell to the left, ({r},{c - 1}). After this, every cell that drains through ({r},{c}) is marked.
    dfs(r, c - 1, seen, h);
  };

  // @why Top row touches the Pacific and bottom row touches the Atlantic.
  // @phase Start a climb from every shore cell
  // @yes Column {c}: its top cell touches the Pacific and its bottom cell the Atlantic.
  // @no The top and bottom shores are done.
  for (let c = 0; c < cols; c++) {
    // @why Start from the top edge for the Pacific.
    // @say ({0},{c}) sits on the Pacific shore, so it drains there. Climb from it.
    dfs(0, c, pac, heights[0][c]);
    // @why Start from the bottom edge for the Atlantic.
    // @say ({rows - 1},{c}) sits on the Atlantic shore. Climb from it.
    // @then {pac.size} {pac.size === 1 ? "cell drains" : "cells drain"} to the Pacific and {atl.size} to the Atlantic so far.
    dfs(rows - 1, c, atl, heights[rows - 1][c]);
  }
  // @why Left column touches the Pacific and right column touches the Atlantic.
  // @yes Row {r}: its left cell touches the Pacific and its right cell the Atlantic.
  // @no All four shores are done: pac and atl now hold every cell that drains to each ocean.
  for (let r = 0; r < rows; r++) {
    // @why Start from the left edge for the Pacific.
    // @say ({r},{0}) sits on the Pacific shore. Climb from it; cells already marked stop at once.
    dfs(r, 0, pac, heights[r][0]);
    // @why Start from the right edge for the Atlantic.
    // @say ({r},{cols - 1}) sits on the Atlantic shore. Climb from it.
    // @then {pac.size} {pac.size === 1 ? "cell drains" : "cells drain"} to the Pacific and {atl.size} to the Atlantic so far.
    dfs(r, cols - 1, atl, heights[r][cols - 1]);
  }

  // @why Collects the cells that reach both oceans.
  // @phase Answer: cells in both sets
  // @say A cell drains to both oceans exactly when both climbs reached it, so the answer is the overlap of the two sets.
  const result: number[][] = [];
  // @why Check every cell against both sets.
  // @yes Check row {r}.
  // @no Every cell has been checked.
  for (let r = 0; r < rows; r++) {
    // @why Go through each column of this row.
    // @yes Check ({r},{c}).
    // @no Row {r} is done.
    for (let c = 0; c < cols; c++) {
      // @why Same cell id used when marking.
      const key = r * cols + c;
      // @why Only cells in both sets can reach both oceans.
      // @yes ({r},{c}) was reached by both climbs, so its water can reach both oceans.
      // @no ({r},{c}) {pac.has(key) ? "reaches only the Pacific" : atl.has(key) ? "reaches only the Atlantic" : "reaches neither ocean"}, so it is left out.
      if (pac.has(key) && atl.has(key)) result.push([r, c]); // @ask result.length
    }
  }
  // @why All cells that drain to both oceans.
  // @returns {result.length} {result.length === 1 ? "cell drains" : "cells drain"} to both oceans. Each climb marks a cell at most once per ocean, so O(m·n).
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
