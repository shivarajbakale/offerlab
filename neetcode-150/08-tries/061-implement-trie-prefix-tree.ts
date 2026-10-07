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

// @why One letter position in the trie.
class TrieNode {
  // @why Maps each next letter to the node for it.
  children = new Map<string, TrieNode>();
  // @why True if a word ends exactly at this node, so 'app' and 'apple' can be told apart.
  isWord = false;
}

// @rule each node's path from root spells a prefix of an added word; isWord marks a whole word
// @why A trie stores words letter by letter so words with the same start share a path.
export class Trie {
  // @why The empty starting node; every word begins here.
  root = new TrieNode();

  // @why Adds a word, creating any missing nodes along its path.
  insert(word: string): void {
    // @why `node` is our current spot, starting at the root.
    let node = this.root;
    // @why Handle each letter in order.
    for (const ch of word) {
      // @why Look for an existing node for this letter.
      let next = node.children.get(ch); // @ask next===undefined
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
    // @why The word ends here; mark it so `search` can tell it is a full word.
    node.isWord = true; // @moment added "{word}"
  }

  // @why True only if the whole word was added.
  search(word: string): boolean {
    // @why Follow the path; it must exist and end on a marked node.
    return this.walk(word)?.isWord ?? false;
  }

  // @why True if any added word starts with `prefix`.
  startsWith(prefix: string): boolean {
    // @why Following the path is enough; no need for a word to end there.
    return this.walk(prefix) !== null;
  }

  // Follow `s` from the root; return the final node, or null if the path breaks.
  // @why Shared helper: follow letters from the root to the final node.
  private walk(s: string): TrieNode | null {
    // @why Start at the root.
    let node = this.root;
    // @why Go letter by letter.
    for (const ch of s) {
      // @why Look for the next letter's node.
      const next = node.children.get(ch);
      // @why No such node, so no word has this start.
      if (!next) return null;
      // @why Step down.
      node = next;
    }
    // @why The whole path exists; hand back where it ended.
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
