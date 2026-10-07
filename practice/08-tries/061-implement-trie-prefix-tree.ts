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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class Trie {
  insert(word: string): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  search(word: string): boolean {
    // TODO: implement
    throw new Error("Not implemented");
  }

  startsWith(prefix: string): boolean {
    // TODO: implement
    throw new Error("Not implemented");
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
