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
 *
 * Pattern: trie,backtracking
 * Key insight: Searching each word separately repeats the same board walks. Walking one
 *   trie alongside the board searches all words at once and abandons a path as soon as it
 *   stops being a prefix of any word; pruning exhausted trie branches makes later
 *   searches faster.
 * Real world: Boggle solvers and multi-pattern scanners (like Aho-Corasick in grep or
 *   antivirus engines) that match a whole dictionary in one pass instead of one pattern
 *   at a time.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why One letter position in the trie of all target words.
class TrieNode {
  // @why Maps each next letter to the node for it.
  children = new Map<string, TrieNode>();
  // @why Holds the full word if one ends here, so we can output it without rebuilding.
  word: string | null = null; // set on the node where a word ends
}

// @why Finds every word from `words` that can be traced on the grid.
export function findWords(board: string[][], words: string[]): string[] {
  // @why Put all words in one trie so one grid walk searches for all of them at once.
  const root = new TrieNode();
  // @why Insert each word.
  for (const w of words) {
    // @why Start at the root for each word.
    let node = root;
    // @why Go letter by letter.
    for (const ch of w) {
      // @why Look for an existing node for this letter.
      let next = node.children.get(ch);
      // @why No node yet for this letter.
      if (!next) {
        // @why Make one.
        next = new TrieNode();
        // @why Hook it under the current node.
        node.children.set(ch, next);
      }
      // @why Step down.
      node = next;
    }
    // @why Mark where this word ends.
    node.word = w;
  }

  // @why Grid size, used to stay inside the borders.
  const rows = board.length;
  const cols = board[0].length;
  // @why Collects the words we find.
  const result: string[] = [];

  // @why Explore from cell (r, c), following the trie node `parent`.
  const dfs = (r: number, c: number, parent: TrieNode): void => {
    // @why The letter in this cell.
    const ch = board[r][c];
    // @why Is there a word path continuing with this letter?
    const node = parent.children.get(ch);
    // @why No word starts this way, so stop early.
    if (!node) return;

    // @why A word ends at this node.
    if (node.word !== null) {
      // @why Record the word.
      result.push(node.word);
      // @why Clear it so the same word is not added twice.
      node.word = null; // report each word once
    }

    // @why Mark the cell used so a path cannot reuse it.
    board[r][c] = "#"; // mark visited
    // @why Try moving up.
    if (r > 0) dfs(r - 1, c, node);
    // @why Try moving down.
    if (r < rows - 1) dfs(r + 1, c, node);
    // @why Try moving left.
    if (c > 0) dfs(r, c - 1, node);
    // @why Try moving right.
    if (c < cols - 1) dfs(r, c + 1, node);
    // @why Restore the letter so other paths can use this cell.
    board[r][c] = ch;

    // Prune exhausted branches.
    // @why A node with no children and no word is useless; remove it so later searches skip dead branches.
    if (node.children.size === 0 && node.word === null) parent.children.delete(ch);
  };

  // @why Start a search from every cell.
  for (let r = 0; r < rows; r++) {
    // @why Try every column in this row.
    for (let c = 0; c < cols; c++) dfs(r, c, root);
  }
  // @why Return all the words found.
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
