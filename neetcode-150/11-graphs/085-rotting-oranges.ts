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

// @rule queue holds exactly the oranges that rotted in the last minute
// @why Returns the minutes until no fresh orange is left, or -1 if that is impossible.
export function orangesRotting(grid: number[][]): number {
  // @why Save the grid size once for the bounds check.
  const rows = grid.length;
  const cols = grid[0].length;
  // @why Current wave of rotten oranges; all of them spread rot at the same minute.
  let queue: [number, number][] = [];
  // @why Count fresh oranges so we know when all have rotted.
  let fresh = 0;

  // @why Scan the grid once to find the starting state.
  for (let r = 0; r < rows; r++) {
    // @why Check each cell in this row.
    for (let c = 0; c < cols; c++) {
      // @why Every rotten orange starts spreading at minute 0, so all go in the queue together.
      if (grid[r][c] === 2) queue.push([r, c]);
      // @why Count each fresh orange so we can check at the end if any are left.
      else if (grid[r][c] === 1) fresh++;
    }
  }

  // @why The four directions rot can spread.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // @why Each full wave of spreading takes one minute.
  let minutes = 0;
  // @why Keep going while rot can still spread and fresh oranges remain.
  while (queue.length && fresh > 0) {
    // @why Oranges that rot during this minute; they spread in the next one.
    const next: [number, number][] = [];
    // @why Spread rot from every orange in the current wave.
    for (const [r, c] of queue) {
      // @why Look at each of the four neighbours.
      for (const [dr, dc] of dirs) {
        // @why Row of the neighbour.
        const nr = r + dr;
        // @why Column of the neighbour.
        const nc = c + dc;
        // @why Ignore off-grid cells, empty cells, and oranges that are not fresh.
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] !== 1) continue;
        // @why This fresh orange rots now; marking it also stops us from adding it twice.
        grid[nr][nc] = 2;
        // @why One less fresh orange to worry about.
        fresh--; // @ask fresh
        // @why It will spread rot in the next minute.
        next.push([nr, nc]);
      }
    }
    // @why Move on to the next wave.
    queue = next; // @ask queue.length
    // @why A whole wave finished, so one minute has passed.
    minutes++; // @moment minute {minutes + 1} done, {fresh} fresh left
  }
  // @why If any fresh orange could not be reached, it can never rot, so the answer is -1.
  return fresh === 0 ? minutes : -1;
}

test("994. Rotting Oranges", () => {
  assert.equal(orangesRotting([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), 4);
  assert.equal(orangesRotting([[2, 1, 1], [0, 1, 1], [1, 0, 1]]), -1);
  assert.equal(orangesRotting([[0, 2]]), 0);
  assert.equal(orangesRotting([[0]]), 0);
  assert.equal(orangesRotting([[1]]), -1);
});
