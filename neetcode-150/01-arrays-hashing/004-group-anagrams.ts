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
export function groupAnagrams(strs: string[]): string[][] {
  // @why Map from a letter-count signature to the words that share it.
  const groups = new Map<string, string[]>();
  // @why The code of 'a', so letters map to slots 0 to 25.
  const a = "a".charCodeAt(0);
  // @why Handle each word once.
  for (const s of strs) {
    // @why Count how many times each letter appears in this word.
    const counts = new Array<number>(26).fill(0);
    // @why Add up the letters of the word into `counts`.
    for (let i = 0; i < s.length; i++) counts[s.charCodeAt(i) - a]++;
    // @why Anagrams have the same counts, so the counts as text make a shared key.
    const key = counts.join(",");
    // @why Check if this key already has a bucket.
    const group = groups.get(key); // @ask group!==undefined
    // @why Bucket exists, so just add the word to it.
    if (group) group.push(s);
    // @why No bucket yet, so start one with this word.
    else groups.set(key, [s]); // @moment new family: {s}
  }
  // @why The buckets are the answer; the keys were only for matching.
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
