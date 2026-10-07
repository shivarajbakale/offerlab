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
  // @goal how do you store "{word}" so that every prefix of it can be found later?
  insert(word: string): void {
    // @why `node` is our current spot, starting at the root.
    // @phase Walk down the word, adding missing letters
    // @say A plain list of words makes every prefix query scan all words. A trie stores each letter once per shared start, so "{word}" reuses whatever path already exists and only adds what is new.
    let node = this.root;
    // @why Handle each letter in order.
    // @say Next letter: "{ch}".
    for (const ch of word) {
      // @why Look for an existing node for this letter.
      // @say Does some earlier word already continue with "{ch}" from here?
      let next = node.children.get(ch); // @ask next===undefined
      // @why No node yet for this letter.
      // @yes No word stored so far continues with "{ch}" here, so the path has to grow by one node.
      // @no An earlier word already goes through "{ch}" here. Share its node instead of making a copy.
      if (!next) {
        // @why Make one.
        // @say Create a node for "{ch}".
        next = new TrieNode();
        // @why Hook it under the current node.
        // @say Link it under the current node with the label "{ch}", so a later lookup of this prefix finds it.
        node.children.set(ch, next);
      }
      // @why Step down to that letter's node.
      // @say Step down into "{ch}".
      node = next;
    }
    // @why The word ends here; mark it so `search` can tell it is a full word.
    // @phase Mark where the word ends
    // @say The path for "{word}" exists, but a path alone only proves a prefix. Flag this node so search("{word}") can tell a whole word ends here.
    node.isWord = true; // @moment added "{word}"
    // @returns nothing; "{word}" is stored in O(length of the word).
  }

  // @why True only if the whole word was added.
  // @goal was the exact word "{word}" inserted?
  search(word: string): boolean {
    // @why Follow the path; it must exist and end on a marked node.
    // @say Follow "{word}" from the root. Reaching the end is not enough: "{word}" might just be a prefix of a longer word, so the end node must be flagged.
    // @returns whether the path for "{word}" exists and its last node is flagged as a word end.
    return this.walk(word)?.isWord ?? false;
  }

  // @why True if any added word starts with `prefix`.
  // @goal does any inserted word start with "{prefix}"?
  startsWith(prefix: string): boolean {
    // @why Following the path is enough; no need for a word to end there.
    // @say Follow "{prefix}" from the root. Every node exists only because some word passed through it, so if the path exists, a word starts with "{prefix}".
    // @returns whether the path for "{prefix}" exists, no matter if a word ends there.
    return this.walk(prefix) !== null;
  }

  // Follow `s` from the root; return the final node, or null if the path breaks.
  // @why Shared helper: follow letters from the root to the final node.
  // @goal where does the path for "{s}" end in the trie, if it exists at all?
  private walk(s: string): TrieNode | null {
    // @why Start at the root.
    // @phase Follow the letters from the root
    let node = this.root;
    // @why Go letter by letter.
    // @say Next letter: "{ch}".
    for (const ch of s) {
      // @why Look for the next letter's node.
      // @say Is there a branch labelled "{ch}" here?
      const next = node.children.get(ch);
      // @why No such node, so no word has this start.
      // @yes No branch for "{ch}": no inserted word continues this way, so nothing starts with "{s}".
      // @no The branch for "{ch}" exists, so some word continues with it.
      // @returns null: the path for "{s}" breaks at "{ch}".
      if (!next) return null;
      // @why Step down.
      // @say Step down into "{ch}".
      node = next;
    }
    // @why The whole path exists; hand back where it ended.
    // @returns the node at the end of "{s}"{node.isWord ? ", which is flagged as a word end" : ", which is not flagged as a word end"}. Cost: one step per letter, no matter how many words are stored.
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
