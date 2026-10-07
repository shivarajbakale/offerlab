/**
 * 127. Word Ladder
 * Difficulty: Hard
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/word-ladder/
 *
 * A transformation sequence from `beginWord` to `endWord` using `wordList`
 * is a sequence of words where each adjacent pair differs by exactly one
 * letter and every word after the first is in `wordList`. Return the number
 * of words in the shortest such sequence, or 0 if none exists.
 *
 * Example 1:
 *   Input: beginWord = "hit", endWord = "cog",
 *          wordList = ["hot","dot","dog","lot","log","cog"]
 *   Output: 5
 *   Explanation: "hit" -> "hot" -> "dot" -> "dog" -> "cog"
 *
 * Example 2:
 *   Input: beginWord = "hit", endWord = "cog",
 *          wordList = ["hot","dot","dog","lot","log"]
 *   Output: 0
 *   Explanation: "cog" is not in wordList.
 *
 * Constraints:
 *   1 <= beginWord.length <= 10, endWord.length == beginWord.length
 *   1 <= wordList.length <= 5000
 *   All words are lowercase and wordList words are unique
 *   beginWord != endWord
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function ladderLength(beginWord: string, endWord: string, wordList: string[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("127. Word Ladder", () => {
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]), 5);
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log"]), 0);
  assert.equal(ladderLength("a", "c", ["a", "b", "c"]), 2);
  assert.equal(ladderLength("hot", "dog", ["hot", "dog"]), 0);
});
