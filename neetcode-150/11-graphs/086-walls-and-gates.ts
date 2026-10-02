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
 *
 * Approach: Multi-source BFS from all gates
 *   Push every gate into the queue at distance 0. BFS outward; the first
 *   time a room is reached is by its nearest gate, so assign distance and
 *   enqueue. Only INF cells are ever updated, which doubles as "visited".
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: graph-bfs
 * Key insight: Seeding the queue with every gate makes BFS reach each room first from its
 *   nearest gate, so the first distance written is final. Only INF cells are updated, so
 *   the grid doubles as the visited set.
 * Real world: Indoor navigation or game AI precomputing a distance map to the nearest
 *   exit from every walkable tile, so any agent can step downhill to safety.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const INF = 2147483647;

export function wallsAndGates(rooms: number[][]): void {
  const rows = rooms.length;
  const cols = rooms[0].length;
  const queue: [number, number][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (rooms[r][c] === 0) queue.push([r, c]);
  }

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length; head++) {
    const [r, c] = queue[head];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || rooms[nr][nc] !== INF) continue;
      rooms[nr][nc] = rooms[r][c] + 1;
      queue.push([nr, nc]);
    }
  }
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
