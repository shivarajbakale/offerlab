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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class WordDictionary {
  addWord(word: string): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  search(word: string): boolean {
    // TODO: implement
    throw new Error("Not implemented");
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
