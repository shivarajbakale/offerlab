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
 *
 * Pattern: hashing
 * Key insight: Anagrams are equal as multisets, so order does not matter, only counts.
 *   Adding for s and subtracting for t in one array means a single all-zero check settles
 *   it.
 * Real world: A spell checker suggesting words that use exactly the letters typed, by
 *   comparing letter-count signatures.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Return true if `t` uses exactly the same letters as `s`.
export function isAnagram(s: string, t: string): boolean {
  // @why Different lengths can never match, so quit early.
  if (s.length !== t.length) return false;
  // @why One counter per letter a-z; `s` adds to it and `t` takes away.
  const counts = new Array<number>(26).fill(0);
  // @why The code of 'a', so a letter's code minus this gives its slot 0 to 25.
  const a = "a".charCodeAt(0);
  // @why Both strings have the same length, so one loop walks them together.
  for (let i = 0; i < s.length; i++) {
    // @why Count this letter of `s` as one more.
    counts[s.charCodeAt(i) - a]++;
    // @why Cancel one of this letter using `t`.
    counts[t.charCodeAt(i) - a]--;
  }
  // @why If every letter cancelled out to zero, the two strings have the same letters.
  return counts.every((c) => c === 0);
}

test("242. Valid Anagram", () => {
  assert.equal(isAnagram("anagram", "nagaram"), true);
  assert.equal(isAnagram("rat", "car"), false);
  assert.equal(isAnagram("a", "ab"), false);
  assert.equal(isAnagram("aacc", "ccac"), false);
});
