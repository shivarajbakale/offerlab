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

export function groupAnagrams(strs: string[]): string[][] {
  const groups = new Map<string, string[]>();
  const a = "a".charCodeAt(0);
  for (const s of strs) {
    const counts = new Array<number>(26).fill(0);
    for (let i = 0; i < s.length; i++) counts[s.charCodeAt(i) - a]++;
    const key = counts.join(",");
    const group = groups.get(key);
    if (group) group.push(s);
    else groups.set(key, [s]);
  }
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
