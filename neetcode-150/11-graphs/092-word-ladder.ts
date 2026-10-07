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

// @rule queue holds the words exactly steps words from beginWord; visited never repeat
// @why Returns the number of words in the shortest chain from `beginWord` to `endWord`, or 0.
// @goal how many words are in the shortest chain from "{beginWord}" to "{endWord}", changing one letter at a time?
export function ladderLength(beginWord: string, endWord: string, wordList: string[]): number {
  // @why If the end word is not in the list, no chain can end there.
  // @phase Setup: group words that differ by one letter
  // @yes "{endWord}" is not in the word list, and every word in a chain must be.
  // @no "{endWord}" is in the list, so a chain may exist.
  // @returns 0: no chain can end on a word that is not in the list.
  if (!wordList.includes(endWord)) return 0;

  // @why Replace each letter with "*" in turn; words sharing a pattern differ by one letter.
  // @say Finding a word's neighbours by comparing it with every other word is O(n²) over the list. Instead file each word under its wildcard patterns, like "h*t": two words that differ by one letter share exactly one pattern, so one lookup finds all neighbours.
  const patterns = (w: string): string[] =>
    // @why One pattern per letter position, like "h*t" for "hot".
    Array.from({ length: w.length }, (_, j) => w.slice(0, j) + "*" + w.slice(j + 1));

  // @why Groups words by pattern, so we can find one-letter neighbours without comparing every pair.
  const buckets = new Map<string, string[]>();
  // @why Put the start word and every list word into the buckets.
  // @say File the start word and every list word under each pattern it fits.
  for (const word of [beginWord, ...wordList]) {
    // @why Add this word under each of its patterns.
    // @say "{word}" fits {word.length} patterns, one per letter.
    for (const p of patterns(word)) {
      // @why Words already stored under this pattern.
      // @say Is there already a bucket for "{p}"?
      const list = buckets.get(p);
      // @why Add to the existing bucket...
      // @yes "{p}" already holds {JSON.stringify(list)}. "{word}" joins them: each of them is one letter away from it.
      // @no No word so far fits "{p}".
      if (list) list.push(word);
      // @why ...or start a new bucket.
      // @say Start the bucket "{p}" with "{word}". Any later word that fits "{p}" joins it.
      else buckets.set(p, [word]);
    }
  }

  // @why Words already used; BFS reaches each word first by its shortest path.
  // @phase Search outward one letter-change at a time
  // @say Search in layers: first every word 1 change from "{beginWord}", then every word 2 changes away, and so on. The first layer that contains "{endWord}" gives the shortest chain, so a word is never worth visiting twice.
  const visited = new Set<string>([beginWord]);
  // @why Current BFS layer of words.
  let queue = [beginWord];
  // @why Length of the chain so far; it counts the start word as 1.
  let steps = 1;
  // @why Keep going while there are new words to expand.
  // @yes Words with a shortest chain of {steps} {steps === 1 ? "word (just the start)" : "words"}: {JSON.stringify(queue)}.
  // @no No new words to reach: every word connected to "{beginWord}" was visited, and "{endWord}" was not among them.
  while (queue.length) {
    // @why Words one more step away.
    // @say Words found from this layer go in a separate list: they are one change farther, so they belong to the next layer.
    const next: string[] = [];
    // @why Expand every word in this layer.
    // @say Take each word of this layer in turn.
    for (const word of queue) {
      // @why BFS finds the shortest chain first, so return the length right away.
      // @yes "{word}" is the target. Layers go in order of length, so no shorter chain exists.
      // @no "{word}" is not "{endWord}", so look at its neighbours.
      // @returns {steps}: the first layer to contain "{endWord}" is {steps} words from "{beginWord}", counting both ends.
      if (word === endWord) return steps;
      // @why Look at each pattern this word fits.
      // @say Every word one letter away from "{word}" shares one of its patterns. Look in each bucket.
      for (const p of patterns(word)) {
        // @why Every word in that bucket is one letter away.
        // @say Bucket "{p}" holds {JSON.stringify(buckets.get(p))}.
        for (const nb of buckets.get(p)!) {
          // @why Skip words already seen; a longer path to them is useless.
          // @yes {nb === word ? "That is \"" + word + "\" itself, already reached." : "\"" + nb + "\" was already reached in this layer or an earlier one. A route through it now would be no shorter."}
          // @no "{nb}" is new: it is one change from "{word}", so the shortest chain to it has {steps + 1} words.
          if (visited.has(nb)) continue;
          // @why Mark it so no later path adds it again.
          // @say Mark "{nb}" as reached now, so a word later in this layer doesn't add it a second time.
          visited.add(nb); // @moment reach {nb} at step {steps + 1}
          // @why It becomes part of the next layer.
          // @say "{nb}" joins the next layer.
          // @then Next layer so far: {JSON.stringify(next)}.
          next.push(nb);
        }
      }
    }
    // @why Move on to the next layer.
    // @say Layer {steps} is done without finding "{endWord}". Its new words, {JSON.stringify(next)}, are the next layer.
    queue = next; // @ask queue.length
    // @why One more word added to the chain.
    // @say Chains now have one more word: {steps} → {steps + 1}.
    steps++; // @ask steps
  }
  // @why The queue ran out without reaching the end word, so no chain exists.
  // @phase Answer
  // @returns 0: "{endWord}" can't be reached from "{beginWord}" one letter at a time.
  return 0;
}

test("127. Word Ladder", () => {
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]), 5);
  assert.equal(ladderLength("hit", "cog", ["hot", "dot", "dog", "lot", "log"]), 0);
  assert.equal(ladderLength("a", "c", ["a", "b", "c"]), 2);
  assert.equal(ladderLength("hot", "dog", ["hot", "dog"]), 0);
});
