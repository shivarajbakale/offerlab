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

// @rule a '.' tries every child; a match must end on a node with isWord set
// @why A trie that also supports '.' as a wildcard letter when searching.
export class WordDictionary {
  // @why The empty starting node.
  root = new TrieNode();

  // @why Adds a word, creating missing nodes along its path.
  // @goal how do you store "{word}" so lookups can follow it letter by letter?
  addWord(word: string): void {
    // @why `node` is our current spot, starting at the root.
    // @phase Add: walk down the word, creating missing letters
    // @say Keeping a plain list would make every search compare against every word. A trie shares common starts, so a search only follows letters that some stored word actually has.
    let node = this.root;
    // @why Handle each letter in order.
    // @say Next letter: "{ch}".
    for (const ch of word) {
      // @why Look for an existing node for this letter.
      // @say Does a stored word already continue with "{ch}" here?
      let next = node.children.get(ch);
      // @why No node yet for this letter.
      // @yes Nothing continues with "{ch}" yet, so grow the path by one node.
      // @no An earlier word already passes through "{ch}" here, so share its node.
      if (!next) {
        // @why Make one.
        // @say Create a node for "{ch}".
        next = new TrieNode();
        // @why Hook it under the current node.
        // @say Link it under the current node, labelled "{ch}".
        node.children.set(ch, next);
      }
      // @why Step down to that letter's node.
      // @say Step down into "{ch}".
      node = next;
    }
    // @why Mark the end so this exact word is findable.
    // @say Flag the last node: a whole word, "{word}", ends here, not just a prefix of one.
    node.isWord = true; // @moment added "{word}"
    // @returns nothing; "{word}" is stored.
  }

  // @why Looks up a word that may have '.' standing for any letter.
  // @goal does any stored word match "{word}", where "." can be any letter?
  search(word: string): boolean {
    // @why Check from node `node` using letter `i` of the word; recursion lets '.' try every branch.
    // @phase Search: follow letters, branch on every "."
    // @say A normal letter has one place to go, so a plain loop would do. A "." can be any letter, so you have to try every branch and come back if one fails: that is what recursion gives you.
    // @goal {i === word.length ? "the whole pattern \"" + word + "\" is used up: does a stored word end at this trie node?" : "starting at this trie node, can the rest of the pattern, \"" + word.slice(i) + "\", be matched?"}
    const dfs = (node: TrieNode, i: number): boolean => {
      // @why All letters matched; it counts only if a word ends here.
      // @yes Every letter of "{word}" is matched. That only counts if a stored word ends exactly here, not just passes through.
      // @no Still to match: "{word[i]}" at position {i}.
      // @returns {node.isWord}: {node.isWord ? "a stored word ends exactly here" : "this is only a prefix of longer stored words"}.
      if (i === word.length) return node.isWord;
      // @why The letter we need next.
      const ch = word[i];
      // @why A wildcard could be any letter, so we must try every child.
      // @yes Wildcard. {node.children.size === 0 ? "But no stored word continues past this point, so there is nothing for it to match." : node.children.size === 1 ? "Only one letter continues from here, \"" + [...node.children.keys()][0] + "\", so try that." : "It could be any of the " + node.children.size + " letters that continue from here, " + JSON.stringify([...node.children.keys()]) + ". Try each."}
      // @no "{ch}" is a real letter, so there is exactly one branch it can follow.
      if (ch === ".") {
        // @why Try each possible child.
        // @say Let "." be one of the letters here, and try to match the rest from that branch.
        for (const child of node.children.values()) {
          // @why One working branch is enough.
          // @yes This branch matched the rest of the pattern. One match is enough.
          // @no This branch does not lead to a match. Try the next letter for the ".".
          // @returns true: one choice for the "." works.
          if (dfs(child, i + 1)) return true;
        }
        // @why No branch matched.
        // @returns false: no letter at this "." leads to a full match.
        return false;
      }
      // @why A normal letter has exactly one place to go.
      // @say Look for the branch labelled "{ch}".
      const next = node.children.get(ch); // @ask next===undefined
      // @why Keep going only if that child exists.
      // @say {next !== undefined ? "Found \"" + ch + "\". Match the rest from there." : "No stored word continues with \"" + ch + "\" here, so this path fails."}
      // @returns {next === undefined ? "false: \"" + ch + "\" is not stored here." : i + 1 === word.length ? "whether a stored word ends right after \"" + ch + "\"." : "whether \"" + ch + "\" leads on to a match for the rest, \"" + word.slice(i + 1) + "\"."}
      return next !== undefined && dfs(next, i + 1);
    };
    // @why Start from the root at the first letter.
    // @say Start at the root with the whole pattern "{word}".
    // @returns whether some stored word matches "{word}".
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
