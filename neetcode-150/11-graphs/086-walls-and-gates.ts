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

// @why Marks an empty room that no gate has reached yet.
const INF = 2147483647;

// @why Fills each empty room with its distance to the nearest gate, in place.
export function wallsAndGates(rooms: number[][]): void {
  // @why Save the grid size once for the bounds check.
  const rows = rooms.length;
  const cols = rooms[0].length;
  // @why Gates to spread from; BFS reaches rooms in order of distance.
  const queue: [number, number][] = [];

  // @why Scan the grid for gates.
  for (let r = 0; r < rows; r++) {
    // @why Every gate (0) goes in the queue; starting from all at once finds the NEAREST gate.
    for (let c = 0; c < cols; c++) if (rooms[r][c] === 0) queue.push([r, c]);
  }

  // @why The four directions we can walk.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // @why Use `head` as the queue front so we never need an expensive shift().
  for (let head = 0; head < queue.length; head++) {
    // @why Take the next cell, whose distance is already final.
    const [r, c] = queue[head];
    // @why Try each of the four neighbours.
    for (const [dr, dc] of dirs) {
      // @why Row of the neighbour.
      const nr = r + dr;
      // @why Column of the neighbour.
      const nc = c + dc;
      // @why Skip off-grid cells, walls, gates, and rooms already given a distance.
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || rooms[nr][nc] !== INF) continue;
      // @why This neighbour is one step farther than the current cell; this also marks it visited.
      rooms[nr][nc] = rooms[r][c] + 1;
      // @why Queue it so its own neighbours get distances later.
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
