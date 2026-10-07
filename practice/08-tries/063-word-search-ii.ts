/**
 * 212. Word Search II
 * Difficulty: Hard
 * Category: Tries
 * LeetCode: https://leetcode.com/problems/word-search-ii/
 *
 * Given an m x n grid of letters `board` and a list of `words`, return every
 * word that can be formed on the board. A word is formed from letters of
 * sequentially adjacent cells (horizontal or vertical neighbours), and the
 * same cell may not be used more than once within a single word. The answer
 * may be returned in any order.
 *
 * Example 1:
 *   Input: board = [["o","a","a","n"],
 *                   ["e","t","a","e"],
 *                   ["i","h","k","r"],
 *                   ["i","f","l","v"]],
 *          words = ["oath", "pea", "eat", "rain"]
 *   Output: ["eat", "oath"]
 *
 * Example 2:
 *   Input: board = [["a","b"],["c","d"]], words = ["abcb"]
 *   Output: []
 *
 * Constraints:
 *   1 <= m, n <= 12
 *   board[i][j] is a lowercase English letter.
 *   1 <= words.length <= 3 * 10^4
 *   1 <= words[i].length <= 10
 *   All words are unique and lowercase.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findWords(board: string[][], words: string[]): string[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("212. Word Search II", () => {
  const board = [
    ["o", "a", "a", "n"],
    ["e", "t", "a", "e"],
    ["i", "h", "k", "r"],
    ["i", "f", "l", "v"],
  ];
  assert.deepEqual(findWords(board, ["oath", "pea", "eat", "rain"]).sort(), ["eat", "oath"]);
  assert.deepEqual(findWords([["a", "b"], ["c", "d"]], ["abcb"]), []);

  // Edge cases: single cell, cell reuse not allowed, shared prefixes
  assert.deepEqual(findWords([["a"]], ["a", "aa"]), ["a"]);
  assert.deepEqual(findWords([["a", "b"], ["c", "d"]], ["ab", "abd", "abdc", "abdca"]).sort(), ["ab", "abd", "abdc"]);
});
