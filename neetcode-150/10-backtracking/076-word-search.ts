/**
 * 79. Word Search
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/word-search/
 *
 * Given an m x n grid of characters `board` and a string `word`, return true
 * if `word` exists in the grid. The word must be built from letters of
 * sequentially adjacent cells (horizontal or vertical neighbours), and the
 * same cell may not be used more than once.
 *
 * Example 1:
 *   Input: board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]],
 *          word = "ABCCED"
 *   Output: true
 *
 * Example 2:
 *   Input: same board, word = "SEE"
 *   Output: true
 *
 * Example 3:
 *   Input: same board, word = "ABCB"
 *   Output: false
 *
 * Constraints:
 *   1 <= m, n <= 6
 *   1 <= word.length <= 15
 *   board and word consist of upper- and lowercase English letters
 *
 * Approach: DFS backtracking from every cell
 *   From each cell, DFS matching word[i]. Temporarily mark the cell as
 *   visited (overwrite with "#") while exploring its 4 neighbours, then
 *   restore it on the way back.
 *
 * Time: O(m * n * 4^L) where L = word.length   Space: O(L) recursion
 *
 * Pattern: backtracking, grid-dfs
 * Key insight: Overwriting the current cell with "#" doubles as the visited set for this
 *   one path, and restoring it on the way back frees the cell for other paths. A mismatch
 *   on any letter prunes the whole branch at once, so most starting cells die after one
 *   comparison.
 * Real world: A word-game app (Boggle, word search puzzles) checking whether a player's
 *   traced word really exists on the letter grid without reusing a tile.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule cells marked '#' are exactly the current path; each is restored on the way back
// @why Returns true if `word` can be traced through neighboring cells of the grid.
export function exist(board: string[][], word: string): boolean {
  // @why Number of rows in the grid.
  const rows = board.length;
  // @why Number of columns in the grid.
  const cols = board[0].length;

  // @why Can the rest of the word (from letter `i`) be matched starting at cell (r, c)?
  const dfs = (r: number, c: number, i: number): boolean => {
    // @why Every letter matched, so the word was found.
    if (i === word.length) return true;
    // @why Fail if we are off the grid or the cell holds the wrong letter (a '#' also fails here).
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== word[i]) {
      // @why This path can't work.
      return false;
    }
    // @why Remember the letter so we can put it back later.
    const ch = board[r][c];
    // @why Mark the cell used so the path can't reuse it.
    board[r][c] = "#"; // mark visited // @moment {word[i]} at {r},{c}
    // @why Try going down, up, right, then left; any success is enough.
    const found =
      dfs(r + 1, c, i + 1) ||
      dfs(r - 1, c, i + 1) ||
      dfs(r, c + 1, i + 1) ||
      dfs(r, c - 1, i + 1);
    // @why Backtrack: put the letter back so other paths can use this cell.
    board[r][c] = ch; // restore // @ask found
    // @why Pass the result up.
    return found;
  };

  // @why The word can start at any cell, so try them all.
  for (let r = 0; r < rows; r++) {
    // @why Go through each column of this row.
    for (let c = 0; c < cols; c++) {
      // @why As soon as one start cell works, we are done.
      if (dfs(r, c, 0)) return true;
    }
  }
  // @why No starting cell worked.
  return false;
}

test("79. Word Search", () => {
  const board = () => [
    ["A", "B", "C", "E"],
    ["S", "F", "C", "S"],
    ["A", "D", "E", "E"],
  ];
  assert.equal(exist(board(), "ABCCED"), true);
  assert.equal(exist(board(), "SEE"), true);
  assert.equal(exist(board(), "ABCB"), false);
  assert.equal(exist([["a"]], "a"), true);
  assert.equal(exist([["a", "a"]], "aaa"), false);
});
