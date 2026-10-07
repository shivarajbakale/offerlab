/**
 * 778. Swim in Rising Water
 * Difficulty: Hard
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/swim-in-rising-water/
 *
 * You are given an n x n grid where grid[i][j] is the elevation at (i, j).
 * At time t the water depth everywhere is t. You can swim from a cell to a
 * 4-directionally adjacent cell only if both elevations are at most t, and
 * swimming takes no time. Starting at (0, 0), return the least time t at
 * which you can reach (n - 1, n - 1).
 *
 * Example 1:
 *   Input: grid = [[0,2],[1,3]]
 *   Output: 3
 *
 * Example 2:
 *   Input: grid = [
 *     [0,1,2,3,4],
 *     [24,23,22,21,5],
 *     [12,13,14,15,16],
 *     [11,17,18,19,20],
 *     [10,9,8,7,6]
 *   ]
 *   Output: 16
 *
 * Constraints:
 *   1 <= n <= 50
 *   0 <= grid[i][j] < n^2, all values unique
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function swimInWater(grid: number[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("778. Swim in Rising Water", () => {
  assert.equal(swimInWater([[0, 2], [1, 3]]), 3);
  assert.equal(
    swimInWater([
      [0, 1, 2, 3, 4],
      [24, 23, 22, 21, 5],
      [12, 13, 14, 15, 16],
      [11, 17, 18, 19, 20],
      [10, 9, 8, 7, 6],
    ]),
    16,
  );
  assert.equal(swimInWater([[0]]), 0);
  assert.equal(swimInWater([[3, 2], [0, 1]]), 3);
});
