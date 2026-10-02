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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function exist(board: string[][], word: string): boolean {
  const rows = board.length;
  const cols = board[0].length;

  const dfs = (r: number, c: number, i: number): boolean => {
    if (i === word.length) return true;
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== word[i]) {
      return false;
    }
    const ch = board[r][c];
    board[r][c] = "#"; // mark visited
    const found =
      dfs(r + 1, c, i + 1) ||
      dfs(r - 1, c, i + 1) ||
      dfs(r, c + 1, i + 1) ||
      dfs(r, c - 1, i + 1);
    board[r][c] = ch; // restore
    return found;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dfs(r, c, 0)) return true;
    }
  }
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
