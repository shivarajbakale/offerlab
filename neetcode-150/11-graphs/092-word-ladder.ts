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
 *
 * Approach: BFS over wildcard patterns
 *   Bucket every word by each of its wildcard patterns ("h*t", "*ot", ...).
 *   Words sharing a pattern are neighbors. BFS from beginWord level by level;
 *   the level at which endWord is popped is the answer.
 *
 * Time: O(m^2 * n)  (n words of length m)   Space: O(m^2 * n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function ladderLength(beginWord: string, endWord: string, wordList: string[]): number {
  if (!wordList.includes(endWord)) return 0;

  const patterns = (w: string): string[] =>
    Array.from({ length: w.length }, (_, j) => w.slice(0, j) + "*" + w.slice(j + 1));

  const buckets = new Map<string, string[]>();
  for (const word of [beginWord, ...wordList]) {
    for (const p of patterns(word)) {
      const list = buckets.get(p);
      if (list) list.push(word);
      else buckets.set(p, [word]);
    }
  }

  const visited = new Set<string>([beginWord]);
  let queue = [beginWord];
  let steps = 1;
  while (queue.length) {
    const next: string[] = [];
    for (const word of queue) {
      if (word === endWord) return steps;
      for (const p of patterns(word)) {
        for (const nb of buckets.get(p)!) {
          if (visited.has(nb)) continue;
          visited.add(nb);
          next.push(nb);
        }
      }
    }
    queue = next;
    steps++;
  }
  return 0;
}

test("127. Word Ladder", () => {
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]), 5);
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log"]), 0);
  assert.equal(ladderLength("a", "c", ["a", "b", "c"]), 2);
  assert.equal(ladderLength("hot", "dog", ["hot", "dog"]), 0);
});
