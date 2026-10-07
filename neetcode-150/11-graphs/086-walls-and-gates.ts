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

// @rule cells leave the queue in order of distance, so a first distance is the nearest gate
// @why Fills each empty room with its distance to the nearest gate, in place.
// @goal how far is each empty room on this {rooms.length}×{rooms[0].length} grid from its nearest gate?
export function wallsAndGates(rooms: number[][]): void {
  // @why Save the grid size once for the bounds check.
  // @phase Setup: every gate starts the search at distance 0
  // @say Running a separate search from each room (or each gate) repeats the same walks: O((m·n)²). Instead start one search from all gates at once. It reaches cells in order of distance, so the first gate to reach a room is its nearest.
  const rows = rooms.length;
  const cols = rooms[0].length;
  // @why Gates to spread from; BFS reaches rooms in order of distance.
  const queue: [number, number][] = [];

  // @why Scan the grid for gates.
  // @yes Look for gates in row {r}.
  // @no The scan is done: {queue.length} {queue.length === 1 ? "gate starts" : "gates start"} the search together.
  for (let r = 0; r < rows; r++) {
    // @why Every gate (0) goes in the queue; starting from all at once finds the NEAREST gate.
    // @yes Look at ({r},{c}).
    // @no Row {r} is done.
    // @say {rooms[r][c] === 0 ? "(" + r + "," + c + ") is a gate: it starts at distance 0, alongside every other gate." : "(" + r + "," + c + ") is " + (rooms[r][c] === -1 ? "a wall" : "a room") + ", not a gate."}
    for (let c = 0; c < cols; c++) if (rooms[r][c] === 0) queue.push([r, c]);
  }

  // @why The four directions we can walk.
  // @phase Spread outward, one step at a time, in order of distance
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // @why Use `head` as the queue front so we never need an expensive shift().
  // @yes Take queue entry {head} of {queue.length}. Cells were queued in order of distance, so this one is never farther than any cell after it.
  // @no The queue is empty: every room a gate can reach has its distance, and rooms still at INF are walled off. The grid was filled in place, so nothing is returned.
  for (let head = 0; head < queue.length; head++) {
    // @why Take the next cell, whose distance is already final.
    // @say ({queue[head][0]},{queue[head][1]}) is {rooms[queue[head][0]][queue[head][1]] === 0 ? "a gate" : rooms[queue[head][0]][queue[head][1]] + " steps from its nearest gate"}. That is final, so its neighbours are one step more.
    const [r, c] = queue[head];
    // @why Try each of the four neighbours.
    // @say Check the four neighbours of ({r},{c}).
    for (const [dr, dc] of dirs) {
      // @why Row of the neighbour.
      // @say Next: the neighbour {dr === 1 ? "below" : dr === -1 ? "above" : dc === 1 ? "to the right" : "to the left"}, at ({r + dr},{c + dc}).
      const nr = r + dr;
      // @why Column of the neighbour.
      // @then ({nr},{nc}) {nr < 0 || nc < 0 || nr >= rows || nc >= cols ? "is off the grid." : rooms[nr][nc] === -1 ? "is a wall." : rooms[nr][nc] === 0 ? "is a gate." : rooms[nr][nc] >= 2147483647 ? "is a room no gate has reached yet." : "already has distance " + rooms[nr][nc] + "; the first distance written is the shortest."}
      const nc = c + dc;
      // @why Skip off-grid cells, walls, gates, and rooms already given a distance.
      // @yes {nr < 0 || nc < 0 || nr >= rows || nc >= cols ? "(" + nr + "," + nc + ") is off the grid" : rooms[nr][nc] === -1 ? "(" + nr + "," + nc + ") is a wall" : rooms[nr][nc] === 0 ? "(" + nr + "," + nc + ") is a gate" : "(" + nr + "," + nc + ") already has distance " + rooms[nr][nc] + ", and the first distance written is the shortest"}, so skip it.
      // @no ({nr},{nc}) is a room no gate has reached yet. Reaching it now, from ({r},{c}), is the shortest way in.
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || rooms[nr][nc] !== INF) continue;
      // @why This neighbour is one step farther than the current cell; this also marks it visited.
      // @say ({nr},{nc}) is one step past ({r},{c}): {rooms[r][c]} + 1 = {rooms[r][c] + 1}. Writing it also marks the room as reached.
      rooms[nr][nc] = rooms[r][c] + 1; // @ask rooms[nr][nc]
      // @why Queue it so its own neighbours get distances later.
      // @say Queue ({nr},{nc}) behind every cell at distance {rooms[nr][nc] - 1}, so its neighbours get {rooms[nr][nc] + 1} only after all closer cells are done.
      queue.push([nr, nc]); // @ask queue.length
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
