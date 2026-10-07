/**
 * 200. Number of Islands
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/number-of-islands/
 *
 * Given an m x n grid of "1"s (land) and "0"s (water), return the number of
 * islands. An island is a group of land cells connected horizontally or
 * vertically, and it is surrounded by water. Assume all four edges of the
 * grid are surrounded by water.
 *
 * Example 1:
 *   Input: grid = [
 *     ["1","1","1","1","0"],
 *     ["1","1","0","1","0"],
 *     ["1","1","0","0","0"],
 *     ["0","0","0","0","0"]
 *   ]
 *   Output: 1
 *
 * Example 2:
 *   Input: grid = [
 *     ["1","1","0","0","0"],
 *     ["1","1","0","0","0"],
 *     ["0","0","1","0","0"],
 *     ["0","0","0","1","1"]
 *   ]
 *   Output: 3
 *
 * Constraints:
 *   1 <= m, n <= 300
 *   grid[i][j] is "0" or "1"
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function numIslands(grid: string[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("200. Number of Islands", () => {
  assert.equal(
    numIslands([
      ["1", "1", "1", "1", "0"],
      ["1", "1", "0", "1", "0"],
      ["1", "1", "0", "0", "0"],
      ["0", "0", "0", "0", "0"],
    ]),
    1,
  );
  assert.equal(
    numIslands([
      ["1", "1", "0", "0", "0"],
      ["1", "1", "0", "0", "0"],
      ["0", "0", "1", "0", "0"],
      ["0", "0", "0", "1", "1"],
    ]),
    3,
  );
  assert.equal(numIslands([["0"]]), 0);
  assert.equal(numIslands([["1", "0", "1"]]), 2);
});
