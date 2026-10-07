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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function exist(board: string[][], word: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
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
