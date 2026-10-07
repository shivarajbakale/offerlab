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

// @rule node is the trie node for the letters on the current path; path cells are '#'
// @why Finds every word from `words` that can be traced on the grid.
// @goal which of {JSON.stringify(words)} can be traced on the grid through neighbouring cells?
export function findWords(board: string[][], words: string[]): string[] {
  // @why Put all words in one trie so one grid walk searches for all of them at once.
  // @phase Build a trie of all the words
  // @say Running a separate grid search for each of the {words.length} words repeats the same walks again and again. Put every word in one trie instead: a single walk from each cell checks all words at once, and stops as soon as no word starts with the letters so far.
  const root = new TrieNode();
  // @why Insert each word.
  // @say Add "{w}" to the trie.
  for (const w of words) {
    // @why Start at the root for each word.
    let node = root;
    // @why Go letter by letter.
    // @say Next letter of "{w}": "{ch}".
    for (const ch of w) {
      // @why Look for an existing node for this letter.
      let next = node.children.get(ch);
      // @why No node yet for this letter.
      // @yes No word added so far continues with "{ch}" here, so make a node for it.
      // @no Another word already passes through "{ch}" here, so "{w}" shares it.
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
    // @say Store "{w}" itself on its last node, so reaching that node during the grid walk hands you the word directly.
    node.word = w;
  }

  // @why Grid size, used to stay inside the borders.
  // @phase Walk the grid, following the trie
  const rows = board.length;
  const cols = board[0].length;
  // @why Collects the words we find.
  const result: string[] = [];

  // @why Explore from cell (r, c), following the trie node `parent`.
  // @goal can the path so far be extended through cell ({r}, {c}) into one of the words?
  const dfs = (r: number, c: number, parent: TrieNode): void => {
    // @why The letter in this cell.
    // @say Cell ({r}, {c}) holds "{board[r][c]}".
    const ch = board[r][c];
    // @why Is there a word path continuing with this letter?
    // @say Does any word continue the current path with "{ch}"? The trie answers in one lookup.
    const node = parent.children.get(ch); // @ask node===undefined
    // @why No word starts this way, so stop early.
    // @yes {ch === "#" ? "This cell is already on the current path, and a cell can't be used twice." : "No word continues with \"" + ch + "\" here."} Every path through here is a dead end, so stop now instead of exploring it.
    // @no Some word continues with "{ch}", so this cell is worth exploring.
    // @returns nothing; this branch can't spell any word.
    if (!node) return;

    // @why A word ends at this node.
    // @yes The letters on this path spell "{node.word}", a whole word from the list.
    // @no No word ends exactly here, but longer words continue: {JSON.stringify([...node.children.keys()])}.
    if (node.word !== null) {
      // @why Record the word.
      result.push(node.word); // @moment found "{node.word}"
      // @why Clear it so the same word is not added twice.
      // @say Clear "{node.word}" from the trie, so a second path spelling it won't report it again.
      node.word = null; // report each word once
    }

    // @why Mark the cell used so a path cannot reuse it.
    // @say Mark ({r}, {c}) as used, so the paths below can't come back through it.
    board[r][c] = "#"; // mark visited
    // @why Try moving up.
    // @yes Try the cell above, ({r - 1}, {c}).
    // @no Top row: nothing above.
    if (r > 0) dfs(r - 1, c, node);
    // @why Try moving down.
    // @yes Try the cell below, ({r + 1}, {c}).
    // @no Bottom row: nothing below.
    if (r < rows - 1) dfs(r + 1, c, node);
    // @why Try moving left.
    // @yes Try the cell to the left, ({r}, {c - 1}).
    // @no Left edge: nothing to the left.
    if (c > 0) dfs(r, c - 1, node);
    // @why Try moving right.
    // @yes Try the cell to the right, ({r}, {c + 1}).
    // @no Right edge: nothing to the right.
    if (c < cols - 1) dfs(r, c + 1, node);
    // @why Restore the letter so other paths can use this cell.
    // @say All four directions from ({r}, {c}) are done. Put "{ch}" back: other paths, starting elsewhere, are allowed to use it.
    board[r][c] = ch;

    // Prune exhausted branches.
    // @why A node with no children and no word is useless; remove it so later searches skip dead branches.
    // @yes Nothing is left to find at or below this "{ch}" node: its words were all reported. This trie branch can never match again. Cut it so later walks stop here at once.
    // @no {node.word !== null ? "A word still ends here." : "Words below still need finding: " + JSON.stringify([...node.children.keys()]) + "."} Keep the branch.
    if (node.children.size === 0 && node.word === null) parent.children.delete(ch); // @ask parent.children.size
    // @returns nothing; every path through ({r}, {c}) is explored.
  };

  // @why Start a search from every cell.
  // @phase Start a walk from every cell
  // @yes Row {r}.
  // @no Every cell has been tried as a starting point.
  for (let r = 0; r < rows; r++) {
    // @why Try every column in this row.
    // @yes Start at ({r}, {c}). Any word could begin here.
    // @no Row {r} is done.
    for (let c = 0; c < cols; c++) dfs(r, c, root);
  }
  // @why Return all the words found.
  // @phase Answer
  // @returns {JSON.stringify(result)}: every word that some path spelled, each reported once.
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
