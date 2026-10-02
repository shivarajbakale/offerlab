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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

class TrieNode {
  children = new Map<string, TrieNode>();
  isWord = false;
}

export class WordDictionary {
  root = new TrieNode();

  addWord(word: string): void {
    let node = this.root;
    for (const ch of word) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    node.isWord = true;
  }

  search(word: string): boolean {
    const dfs = (node: TrieNode, i: number): boolean => {
      if (i === word.length) return node.isWord;
      const ch = word[i];
      if (ch === ".") {
        for (const child of node.children.values()) {
          if (dfs(child, i + 1)) return true;
        }
        return false;
      }
      const next = node.children.get(ch);
      return next !== undefined && dfs(next, i + 1);
    };
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
