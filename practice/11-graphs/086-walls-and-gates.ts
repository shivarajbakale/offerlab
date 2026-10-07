/**
 * 286. Walls and Gates (Premium; LintCode 663)
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/walls-and-gates/
 *
 * You are given an m x n grid `rooms` where each cell is one of:
 *   -1          a wall or obstacle
 *    0          a gate
 *    INF        an empty room (INF = 2^31 - 1 = 2147483647)
 * Fill each empty room with the distance to its nearest gate (moving
 * 4-directionally). If a gate cannot be reached, leave it as INF.
 * Modify the grid in place.
 *
 * Example 1:
 *   Input: rooms = [
 *     [INF, -1,   0,  INF],
 *     [INF, INF, INF, -1 ],
 *     [INF, -1,  INF, -1 ],
 *     [0,   -1,  INF, INF]
 *   ]
 *   Output: [
 *     [3, -1, 0,  1],
 *     [2,  2, 1, -1],
 *     [1, -1, 2, -1],
 *     [0, -1, 3,  4]
 *   ]
 *
 * Example 2:
 *   Input: rooms = [[0, -1], [INF, INF]]
 *   Output: [[0, -1], [1, 2]]
 *
 * Constraints:
 *   1 <= m, n <= 250
 *   rooms[i][j] is -1, 0, or 2^31 - 1
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const INF = 2147483647;

export function wallsAndGates(rooms: number[][]): void {
  // TODO: implement
  throw new Error("Not implemented");
}

test("286. Walls and Gates", () => {
  const g1 = [
    [INF, -1, 0, INF],
    [INF, INF, INF, -1],
    [INF, -1, INF, -1],
    [0, -1, INF, INF],
  ];
  wallsAndGates(g1);
  assert.deepEqual(g1, [
    [3, -1, 0, 1],
    [2, 2, 1, -1],
    [1, -1, 2, -1],
    [0, -1, 3, 4],
  ]);

  const g2 = [[0, -1], [INF, INF]];
  wallsAndGates(g2);
  assert.deepEqual(g2, [[0, -1], [1, 2]]);

  // Unreachable room stays INF.
  const g3 = [[INF, -1, 0]];
  wallsAndGates(g3);
  assert.deepEqual(g3, [[INF, -1, 0]]);
});
