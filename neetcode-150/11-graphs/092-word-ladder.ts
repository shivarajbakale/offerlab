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
 *
 * Pattern: graph-bfs, hashing
 * Key insight: Comparing every pair of words to find one-letter neighbours is O(n^2).
 *   Bucketing words by wildcard patterns like "h*t" finds all neighbours through a hash
 *   lookup, and BFS levels give the shortest chain length.
 * Real world: Spell checkers and fuzzy search finding words one edit away by indexing
 *   wildcard or deletion variants instead of comparing against the whole dictionary.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns the number of words in the shortest chain from `beginWord` to `endWord`, or 0.
export function ladderLength(beginWord: string, endWord: string, wordList: string[]): number {
  // @why If the end word is not in the list, no chain can end there.
  if (!wordList.includes(endWord)) return 0;

  // @why Replace each letter with "*" in turn; words sharing a pattern differ by one letter.
  const patterns = (w: string): string[] =>
    // @why One pattern per letter position, like "h*t" for "hot".
    Array.from({ length: w.length }, (_, j) => w.slice(0, j) + "*" + w.slice(j + 1));

  // @why Groups words by pattern, so we can find one-letter neighbours without comparing every pair.
  const buckets = new Map<string, string[]>();
  // @why Put the start word and every list word into the buckets.
  for (const word of [beginWord, ...wordList]) {
    // @why Add this word under each of its patterns.
    for (const p of patterns(word)) {
      // @why Words already stored under this pattern.
      const list = buckets.get(p);
      // @why Add to the existing bucket...
      if (list) list.push(word);
      // @why ...or start a new bucket.
      else buckets.set(p, [word]);
    }
  }

  // @why Words already used; BFS reaches each word first by its shortest path.
  const visited = new Set<string>([beginWord]);
  // @why Current BFS layer of words.
  let queue = [beginWord];
  // @why Length of the chain so far; it counts the start word as 1.
  let steps = 1;
  // @why Keep going while there are new words to expand.
  while (queue.length) {
    // @why Words one more step away.
    const next: string[] = [];
    // @why Expand every word in this layer.
    for (const word of queue) {
      // @why BFS finds the shortest chain first, so return the length right away.
      if (word === endWord) return steps;
      // @why Look at each pattern this word fits.
      for (const p of patterns(word)) {
        // @why Every word in that bucket is one letter away.
        for (const nb of buckets.get(p)!) {
          // @why Skip words already seen; a longer path to them is useless.
          if (visited.has(nb)) continue;
          // @why Mark it so no later path adds it again.
          visited.add(nb);
          // @why It becomes part of the next layer.
          next.push(nb);
        }
      }
    }
    // @why Move on to the next layer.
    queue = next;
    // @why One more word added to the chain.
    steps++;
  }
  // @why The queue ran out without reaching the end word, so no chain exists.
  return 0;
}

test("127. Word Ladder", () => {
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]), 5);
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log"]), 0);
  assert.equal(ladderLength("a", "c", ["a", "b", "c"]), 2);
  assert.equal(ladderLength("hot", "dog", ["hot", "dog"]), 0);
});
