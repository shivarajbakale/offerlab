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
// @goal how many minutes until every orange on this {grid.length}×{grid[0].length} grid is rotten, if ever?
export function orangesRotting(grid: number[][]): number {
  // @why Save the grid size once for the bounds check.
  // @phase Setup: find the starting rot and count the fresh oranges
  // @say Simulating minute by minute with a full grid scan each time costs O((m·n)²). Instead keep only the oranges that just rotted: each minute, only they can spread rot, so each orange is handled once.
  const rows = grid.length;
  const cols = grid[0].length;
  // @why Current wave of rotten oranges; all of them spread rot at the same minute.
  let queue: [number, number][] = [];
  // @why Count fresh oranges so we know when all have rotted.
  let fresh = 0;

  // @why Scan the grid once to find the starting state.
  // @yes Scan row {r}.
  // @no The scan is done: {queue.length} rotten {queue.length === 1 ? "orange starts" : "oranges start"} the spread, and {fresh} fresh {fresh === 1 ? "orange waits" : "oranges wait"}.
  for (let r = 0; r < rows; r++) {
    // @why Check each cell in this row.
    // @yes Look at ({r},{c}).
    // @no Row {r} is done.
    for (let c = 0; c < cols; c++) {
      // @why Every rotten orange starts spreading at minute 0, so all go in the queue together.
      // @yes ({r},{c}) is rotten. Every rotten orange spreads at the same time, so all of them go in the first wave together.
      // @no ({r},{c}) is not rotten.
      if (grid[r][c] === 2) queue.push([r, c]);
      // @why Count each fresh orange so we can check at the end if any are left.
      // @yes ({r},{c}) is fresh: one more orange that has to rot before we are done.
      // @no ({r},{c}) is an empty cell, nothing to track.
      else if (grid[r][c] === 1) fresh++;
    }
  }

  // @why The four directions rot can spread.
  // @phase Spread: one wave of the queue per minute
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // @why Each full wave of spreading takes one minute.
  let minutes = 0;
  // @why Keep going while rot can still spread and fresh oranges remain.
  // @yes Minute {minutes + 1}: {queue.length} rotten {queue.length === 1 ? "orange" : "oranges"} can still spread, and {fresh} fresh {fresh === 1 ? "one is" : "ones are"} left.
  // @no {fresh === 0 ? "No fresh orange is left, so the rot is complete; counting more minutes would overshoot." : "The rot has nowhere left to spread, yet " + fresh + " fresh " + (fresh === 1 ? "orange remains" : "oranges remain") + ": walled off by empty cells."}
  while (queue.length && fresh > 0) {
    // @why Oranges that rot during this minute; they spread in the next one.
    // @say Oranges that rot this minute go in a separate list. They only start spreading next minute, so they must not join the current wave.
    const next: [number, number][] = [];
    // @why Spread rot from every orange in the current wave.
    // @say Every orange in this wave spreads at the same moment, so take them one at a time; order inside a wave does not matter.
    for (const [r, c] of queue) {
      // @why Look at each of the four neighbours.
      // @say The rotten orange at ({r},{c}) spreads only through its four sides, so check those four neighbours one at a time.
      for (const [dr, dc] of dirs) {
        // @why Row of the neighbour.
        // @say Next: the neighbour {dr === 1 ? "below" : dr === -1 ? "above" : dc === 1 ? "to the right" : "to the left"}, at ({r + dr},{c + dc}).
        const nr = r + dr;
        // @why Column of the neighbour.
        const nc = c + dc;
        // @why Ignore off-grid cells, empty cells, and oranges that are not fresh.
        // @yes {nr < 0 || nc < 0 || nr >= rows || nc >= cols ? "(" + nr + "," + nc + ") is off the grid" : grid[nr][nc] === 0 ? "(" + nr + "," + nc + ") is empty" : "(" + nr + "," + nc + ") is already rotten"}, so there is nothing to rot there.
        // @no ({nr},{nc}) is fresh and touches a rotten orange, so it rots this minute.
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] !== 1) continue;
        // @why This fresh orange rots now; marking it also stops us from adding it twice.
        // @say ({nr},{nc}) rots at minute {minutes + 1}. Marking it at once stops another rotten neighbour from counting it twice.
        grid[nr][nc] = 2;
        // @why One less fresh orange to worry about.
        // @say One fresh orange fewer: {fresh} → {fresh - 1}.
        fresh--; // @ask fresh
        // @why It will spread rot in the next minute.
        // @say ({nr},{nc}) joins the next wave: it starts spreading at minute {minutes + 2}.
        next.push([nr, nc]);
      }
    }
    // @why Move on to the next wave.
    // @say The wave of minute {minutes + 1} is done. The {next.length} {next.length === 1 ? "orange" : "oranges"} it rotted become the only ones that can spread next.
    queue = next; // @ask queue.length
    // @why A whole wave finished, so one minute has passed.
    // @then {minutes} {minutes === 1 ? "minute has" : "minutes have"} passed; {fresh} fresh {fresh === 1 ? "orange is" : "oranges are"} left.
    minutes++; // @moment minute {minutes + 1} done, {fresh} fresh left
  }
  // @why If any fresh orange could not be reached, it can never rot, so the answer is -1.
  // @phase Answer
  // @returns {fresh === 0 && minutes === 0 ? "0: there was no fresh orange to begin with, so no time has to pass." : fresh === 0 ? minutes + ": every orange rotted, and each wave was one minute, so the waves count the minutes." : "-1: " + fresh + " fresh " + (fresh === 1 ? "orange" : "oranges") + " can never be reached by the rot."}
  return fresh === 0 ? minutes : -1;
}

test("994. Rotting Oranges", () => {
  assert.equal(orangesRotting([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), 4);
  assert.equal(orangesRotting([[2, 1, 1], [0, 1, 1], [1, 0, 1]]), -1);
  assert.equal(orangesRotting([[0, 2]]), 0);
  assert.equal(orangesRotting([[0]]), 0);
  assert.equal(orangesRotting([[1]]), -1);
});
