/**
 * 242. Valid Anagram
 * Difficulty: Easy
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/valid-anagram/
 *
 * Given two strings `s` and `t`, return true if `t` is an anagram of `s`
 * (uses exactly the same characters with the same counts), otherwise false.
 *
 * Example 1:
 *   Input: s = "anagram", t = "nagaram"
 *   Output: true
 *
 * Example 2:
 *   Input: s = "rat", t = "car"
 *   Output: false
 *
 * Constraints:
 *   1 <= s.length, t.length <= 5 * 10^4
 *   s and t consist of lowercase English letters.
 *
 * Approach: Character counts
 *   If lengths differ, they cannot be anagrams. Otherwise increment a count
 *   per character of `s` and decrement per character of `t`; every count must
 *   end at zero.
 *
 * Time: O(n)   Space: O(1) (26 letters)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isAnagram(s: string, t: string): boolean {
  if (s.length !== t.length) return false;
  const counts = new Array<number>(26).fill(0);
  const a = "a".charCodeAt(0);
  for (let i = 0; i < s.length; i++) {
    counts[s.charCodeAt(i) - a]++;
    counts[t.charCodeAt(i) - a]--;
  }
  return counts.every((c) => c === 0);
}

test("242. Valid Anagram", () => {
  assert.equal(isAnagram("anagram", "nagaram"), true);
  assert.equal(isAnagram("rat", "car"), false);
  assert.equal(isAnagram("a", "ab"), false);
  assert.equal(isAnagram("aacc", "ccac"), false);
});
