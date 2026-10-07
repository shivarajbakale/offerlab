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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function groupAnagrams(strs: string[]): string[][] {
  const store = new Map<string, string[]>()
  for (let w of strs) {
    const a = 'a'.charCodeAt(0); //97
    const arr = new Array(26).fill(0);
    for (let i = 0; i < w.length; i++) arr[w.charCodeAt(i) - a]++;
    const groupKey = arr.join('');
    const group = store.get(groupKey);

    if (group) {
      group.push(w);
    }
    else {
      store.set(groupKey, [w])
    }
  }
  return [...store.values()]
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
