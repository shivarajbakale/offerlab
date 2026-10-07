/**
 * 49. Group Anagrams
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/group-anagrams/
 *
 * Given an array of strings `strs`, group the anagrams together. The groups
 * and the strings inside them may be returned in any order.
 *
 * Example 1:
 *   Input: strs = ["eat", "tea", "tan", "ate", "nat", "bat"]
 *   Output: [["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]
 *
 * Example 2:
 *   Input: strs = [""]
 *   Output: [[""]]
 *
 * Example 3:
 *   Input: strs = ["a"]
 *   Output: [["a"]]
 *
 * Constraints:
 *   1 <= strs.length <= 10^4
 *   0 <= strs[i].length <= 100
 *   strs[i] consists of lowercase English letters.
 *
 * Approach: Hash map keyed by letter counts
 *   Two strings are anagrams iff their 26-letter count vectors match. Use the
 *   serialized count vector as a map key and bucket each string under it.
 *
 * Time: O(m * n) where m = number of strings, n = average length
 * Space: O(m * n)
 *
 * Pattern: hashing
 * Key insight: All anagrams share the same 26-letter count vector, so that vector
 *   serialized to a string is a canonical key; grouping becomes one map insert per word.
 * Real world: Deduplicating near-identical records by computing a canonical signature for
 *   each and bucketing records by signature.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule words with the same letter counts share one key, so each bucket is one family
// @why Return the words bucketed so each bucket holds one anagram family.
// @goal which words in {JSON.stringify(strs)} are rearrangements of each other?
export function groupAnagrams(strs: string[]): string[][] {
  // @why Map from a letter-count signature to the words that share it.
  // @phase Setup: buckets keyed by a word's letter counts
  // @say Comparing every pair of words is n² comparisons. Instead give each word a key that all its anagrams share, so each word finds its family with one lookup.
  const groups = new Map<string, string[]>();
  // @why The code of 'a', so letters map to slots 0 to 25.
  const a = "a".charCodeAt(0);
  // @why Handle each word once.
  // @phase Each word: compute its key, then join or start its family
  // @say Next word: "{s}". Its family is decided only by which letters it has and how many, never by their order.
  for (const s of strs) {
    // @why Count how many times each letter appears in this word.
    const counts = new Array<number>(26).fill(0);
    // @why Add up the letters of the word into `counts`.
    // @say Count "{s[i]}", letter {i + 1} of "{s}".
    // @yes Letter {i + 1} of "{s}" is next.
    // @no "{s}" is fully counted. These 26 counts are the same for every anagram of it.
    for (let i = 0; i < s.length; i++) counts[s.charCodeAt(i) - a]++;
    // @why Anagrams have the same counts, so the counts as text make a shared key.
    // @say Sorting "{s}" would also make a shared key, at k log k per word. The counts give one in k steps. They are joined into a string because a Map compares arrays by identity, not content.
    const key = counts.join(",");
    // @why Check if this key already has a bucket.
    const group = groups.get(key); // @ask group!==undefined
    // @why Bucket exists, so just add the word to it.
    // @yes An earlier word already has these exact letter counts: {JSON.stringify(group)}. Same counts means same letters, so "{s}" joins them: {JSON.stringify([...group, s])}.
    // @no No earlier word has these letter counts, so "{s}" is not an anagram of anything seen yet.
    if (group) group.push(s);
    // @why No bucket yet, so start one with this word.
    // @say Start a new family with "{s}". Any later anagram of it will compute the same key and land here.
    // @then {groups.size} families so far: {JSON.stringify([...groups.values()])}
    else groups.set(key, [s]); // @moment new family: {s}
  }
  // @why The buckets are the answer; the keys were only for matching.
  // @phase Answer: the buckets themselves
  // @say Every word sits in the bucket for its letter counts, so each bucket is exactly one anagram family. The keys only served for matching.
  // @returns {groups.size} families: each word visited once, so O(n·k) time for n words of length k.
  return [...groups.values()];
}

// Sort inner groups and the outer list so order doesn't matter.
function normalize(groups: string[][]): string[][] {
  return groups
    .map((g) => [...g].sort())
    .sort((x, y) => x.join(",").localeCompare(y.join(",")));
}

test("49. Group Anagrams", () => {
  assert.deepEqual(
    normalize(groupAnagrams(["eat", "tea", "tan", "ate", "nat", "bat"])),
    normalize([["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]),
  );
  assert.deepEqual(groupAnagrams([""]), [[""]]);
  assert.deepEqual(groupAnagrams(["a"]), [["a"]]);
  assert.deepEqual(
    normalize(groupAnagrams(["ab", "ba", "abc"])),
    normalize([["ab", "ba"], ["abc"]]),
  );
});
