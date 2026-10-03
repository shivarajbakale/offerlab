/**
 * 211. Design Add and Search Words Data Structure
 * Difficulty: Medium
 * Category: Tries
 * LeetCode: https://leetcode.com/problems/design-add-and-search-words-data-structure/
 *
 * Design a data structure that supports adding words and checking whether a
 * string matches any previously added word. Implement `WordDictionary`:
 *   - addWord(word): store `word`.
 *   - search(word): return true if any stored word matches `word`, where
 *     each '.' in `word` matches any single letter.
 *
 * Example 1:
 *   Input:
 *     ["WordDictionary", "addWord", "addWord", "addWord",
 *      "search", "search", "search", "search"]
 *     [[], ["bad"], ["dad"], ["mad"], ["pad"], ["bad"], [".ad"], ["b.."]]
 *   Output:
 *     [null, null, null, null, false, true, true, true]
 *
 * Constraints:
 *   1 <= word.length <= 25
 *   Words in addWord are lowercase letters; search words are lowercase
 *   letters or '.'. At most 2 dots per search query.
 *   At most 10^4 calls in total.
 *
 * Approach: Trie + DFS for wildcards
 *   Store words in a trie. Searching follows the single matching child for
 *   a letter, and for '.' tries every child recursively.
 *
 * Time: addWord O(L); search O(L) without dots, O(26^d * L) worst case with
 *       d dots
 * Space: O(total characters inserted)
 *
 * Pattern: trie
 * Key insight: Normal letters follow exactly one child, so only the '.' positions branch
 *   the search. A trie keeps that branching limited to children that actually exist
 *   instead of scanning every stored word.
 * Real world: Crossword and word-game helpers that match patterns like 'c.t', or a
 *   command palette supporting single-character wildcards.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why One letter position in the trie.
class TrieNode {
  // @why Maps each next letter to the node for it.
  children = new Map<string, TrieNode>();
  // @why True if a word ends exactly at this node.
  isWord = false;
}

// @why A trie that also supports '.' as a wildcard letter when searching.
export class WordDictionary {
  // @why The empty starting node.
  root = new TrieNode();

  // @why Adds a word, creating missing nodes along its path.
  addWord(word: string): void {
    // @why `node` is our current spot, starting at the root.
    let node = this.root;
    // @why Handle each letter in order.
    for (const ch of word) {
      // @why Look for an existing node for this letter.
      let next = node.children.get(ch);
      // @why No node yet for this letter.
      if (!next) {
        // @why Make one.
        next = new TrieNode();
        // @why Hook it under the current node.
        node.children.set(ch, next);
      }
      // @why Step down to that letter's node.
      node = next;
    }
    // @why Mark the end so this exact word is findable.
    node.isWord = true;
  }

  // @why Looks up a word that may have '.' standing for any letter.
  search(word: string): boolean {
    // @why Check from node `node` using letter `i` of the word; recursion lets '.' try every branch.
    const dfs = (node: TrieNode, i: number): boolean => {
      // @why All letters matched; it counts only if a word ends here.
      if (i === word.length) return node.isWord;
      // @why The letter we need next.
      const ch = word[i];
      // @why A wildcard could be any letter, so we must try every child.
      if (ch === ".") {
        // @why Try each possible child.
        for (const child of node.children.values()) {
          // @why One working branch is enough.
          if (dfs(child, i + 1)) return true;
        }
        // @why No branch matched.
        return false;
      }
      // @why A normal letter has exactly one place to go.
      const next = node.children.get(ch);
      // @why Keep going only if that child exists.
      return next !== undefined && dfs(next, i + 1);
    };
    // @why Start from the root at the first letter.
    return dfs(this.root, 0);
  }
}

test("211. Design Add and Search Words Data Structure", () => {
  const dict = new WordDictionary();
  dict.addWord("bad");
  dict.addWord("dad");
  dict.addWord("mad");
  assert.equal(dict.search("pad"), false);
  assert.equal(dict.search("bad"), true);
  assert.equal(dict.search(".ad"), true);
  assert.equal(dict.search("b.."), true);

  // Edge cases: all wildcards, wrong length, prefix of a stored word
  assert.equal(dict.search("..."), true);
  assert.equal(dict.search("...."), false);
  assert.equal(dict.search("ba"), false);
});
