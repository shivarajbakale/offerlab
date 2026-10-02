/**
 * 208. Implement Trie (Prefix Tree)
 * Difficulty: Medium
 * Category: Tries
 * LeetCode: https://leetcode.com/problems/implement-trie-prefix-tree/
 *
 * Implement a trie (prefix tree), a tree that stores strings so they can be
 * looked up by whole word or by prefix efficiently. Support:
 *   - insert(word): add `word` to the trie.
 *   - search(word): return true if `word` was inserted before.
 *   - startsWith(prefix): return true if any inserted word starts with
 *     `prefix`.
 *
 * Example 1:
 *   Input:
 *     ["Trie", "insert", "search", "search", "startsWith", "insert", "search"]
 *     [[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]]
 *   Output:
 *     [null, null, true, false, true, null, true]
 *
 * Constraints:
 *   1 <= word.length, prefix.length <= 2000
 *   word and prefix consist only of lowercase English letters.
 *   At most 3 * 10^4 calls in total.
 *
 * Approach: Tree of character maps
 *   Each node maps a character to a child node and flags whether a word ends
 *   there. Insert creates missing nodes along the path; search and
 *   startsWith walk the path and differ only in whether the end flag is
 *   required.
 *
 * Time: O(L) per operation   Space: O(total characters inserted)
 *
 * Pattern: trie
 * Key insight: Words sharing a prefix share a path, so lookup time depends on word
 *   length, not on how many words are stored. search and startsWith follow the same path
 *   and differ only in whether the end-of-word flag is required.
 * Real world: Autocomplete in search boxes and IDEs, and IP routing tables that look up
 *   the longest matching address prefix.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

class TrieNode {
  children = new Map<string, TrieNode>();
  isWord = false;
}

export class Trie {
  root = new TrieNode();

  insert(word: string): void {
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
    return this.walk(word)?.isWord ?? false;
  }

  startsWith(prefix: string): boolean {
    return this.walk(prefix) !== null;
  }

  // Follow `s` from the root; return the final node, or null if the path breaks.
  private walk(s: string): TrieNode | null {
    let node = this.root;
    for (const ch of s) {
      const next = node.children.get(ch);
      if (!next) return null;
      node = next;
    }
    return node;
  }
}

test("208. Implement Trie (Prefix Tree)", () => {
  const trie = new Trie();
  trie.insert("apple");
  assert.equal(trie.search("apple"), true);
  assert.equal(trie.search("app"), false);
  assert.equal(trie.startsWith("app"), true);
  trie.insert("app");
  assert.equal(trie.search("app"), true);

  // Edge cases: words that extend past stored ones, unrelated prefixes
  assert.equal(trie.search("apples"), false);
  assert.equal(trie.startsWith("b"), false);
  assert.equal(trie.startsWith("apple"), true);
});
