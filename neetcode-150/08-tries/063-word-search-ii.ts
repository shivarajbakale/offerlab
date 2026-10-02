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
 *
 * Approach: Trie + backtracking DFS
 *   Put all words in a trie, storing the full word at its terminal node.
 *   DFS from every cell, walking the trie alongside the board so a path is
 *   abandoned as soon as it isn't a prefix of any word. When a terminal node
 *   is reached, record the word and clear it to avoid duplicates; prune trie
 *   branches that become empty so later searches skip them.
 *
 * Time: O(m * n * 4 * 3^(L-1)) worst case, L = max word length
 * Space: O(total characters in words)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

class TrieNode {
  children = new Map<string, TrieNode>();
  word: string | null = null; // set on the node where a word ends
}

export function findWords(board: string[][], words: string[]): string[] {
  const root = new TrieNode();
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    node.word = w;
  }

  const rows = board.length;
  const cols = board[0].length;
  const result: string[] = [];

  const dfs = (r: number, c: number, parent: TrieNode): void => {
    const ch = board[r][c];
    const node = parent.children.get(ch);
    if (!node) return;

    if (node.word !== null) {
      result.push(node.word);
      node.word = null; // report each word once
    }

    board[r][c] = "#"; // mark visited
    if (r > 0) dfs(r - 1, c, node);
    if (r < rows - 1) dfs(r + 1, c, node);
    if (c > 0) dfs(r, c - 1, node);
    if (c < cols - 1) dfs(r, c + 1, node);
    board[r][c] = ch;

    // Prune exhausted branches.
    if (node.children.size === 0 && node.word === null) parent.children.delete(ch);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) dfs(r, c, root);
  }
  return result;
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
