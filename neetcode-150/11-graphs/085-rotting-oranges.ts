/**
 * 994. Rotting Oranges
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/rotting-oranges/
 *
 * In an m x n grid each cell is 0 (empty), 1 (fresh orange) or 2 (rotten
 * orange). Every minute, any fresh orange 4-directionally adjacent to a
 * rotten one becomes rotten. Return the minimum number of minutes until no
 * fresh orange remains, or -1 if that is impossible.
 *
 * Example 1:
 *   Input: grid = [[2,1,1],[1,1,0],[0,1,1]]
 *   Output: 4
 *
 * Example 2:
 *   Input: grid = [[2,1,1],[0,1,1],[1,0,1]]
 *   Output: -1
 *   Explanation: The bottom-left orange is never reached.
 *
 * Example 3:
 *   Input: grid = [[0,2]]
 *   Output: 0
 *
 * Constraints:
 *   1 <= m, n <= 10
 *   grid[i][j] is 0, 1 or 2
 *
 * Approach: Multi-source BFS
 *   Seed the queue with every rotten orange and count fresh ones. Process
 *   the queue level by level; each level is one minute. Stop when no fresh
 *   oranges remain. If some fresh oranges are left over, return -1.
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: graph-bfs
 * Key insight: Starting BFS from all rotten oranges at once means each BFS level is
 *   exactly one minute of spread from every source at the same time. The fresh counter
 *   tells you at the end whether any orange was never reached.
 * Real world: Simulating how a malware infection or a rumor spreads through a network
 *   minute by minute from several initial sources, and how long until it saturates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function orangesRotting(grid: number[][]): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let queue: [number, number][] = [];
  let fresh = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 2) queue.push([r, c]);
      else if (grid[r][c] === 1) fresh++;
    }
  }

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let minutes = 0;
  while (queue.length && fresh > 0) {
    const next: [number, number][] = [];
    for (const [r, c] of queue) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] !== 1) continue;
        grid[nr][nc] = 2;
        fresh--;
        next.push([nr, nc]);
      }
    }
    queue = next;
    minutes++;
  }
  return fresh === 0 ? minutes : -1;
}

test("994. Rotting Oranges", () => {
  assert.equal(orangesRotting([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), 4);
  assert.equal(orangesRotting([[2, 1, 1], [0, 1, 1], [1, 0, 1]]), -1);
  assert.equal(orangesRotting([[0, 2]]), 0);
  assert.equal(orangesRotting([[0]]), 0);
  assert.equal(orangesRotting([[1]]), -1);
});
