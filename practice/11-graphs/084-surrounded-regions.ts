/**
 * 130. Surrounded Regions
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/surrounded-regions/
 *
 * Given an m x n board of "X" and "O", capture every region of "O"s that is
 * completely surrounded by "X"s (4-directionally) by flipping those "O"s to
 * "X". A region that touches the border is not surrounded. Modify the board
 * in place; return nothing.
 *
 * Example 1:
 *   Input: board = [
 *     ["X","X","X","X"],
 *     ["X","O","O","X"],
 *     ["X","X","O","X"],
 *     ["X","O","X","X"]
 *   ]
 *   Output: [
 *     ["X","X","X","X"],
 *     ["X","X","X","X"],
 *     ["X","X","X","X"],
 *     ["X","O","X","X"]
 *   ]
 *
 * Example 2:
 *   Input: board = [["X"]]
 *   Output: [["X"]]
 *
 * Constraints:
 *   1 <= m, n <= 200
 *   board[i][j] is "X" or "O"
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function solve(board: string[][]): void {
  // TODO: implement
  throw new Error("Not implemented");
}

test("130. Surrounded Regions", () => {
  const b1 = [
    ["X", "X", "X", "X"],
    ["X", "O", "O", "X"],
    ["X", "X", "O", "X"],
    ["X", "O", "X", "X"],
  ];
  solve(b1);
  assert.deepEqual(b1, [
    ["X", "X", "X", "X"],
    ["X", "X", "X", "X"],
    ["X", "X", "X", "X"],
    ["X", "O", "X", "X"],
  ]);

  const b2 = [["X"]];
  solve(b2);
  assert.deepEqual(b2, [["X"]]);

  // Interior region connected to the border survives.
  const b3 = [
    ["X", "O", "X"],
    ["X", "O", "X"],
    ["X", "X", "X"],
  ];
  solve(b3);
  assert.deepEqual(b3, [
    ["X", "O", "X"],
    ["X", "O", "X"],
    ["X", "X", "X"],
  ]);
});
