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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isAnagram(s: string, t: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("242. Valid Anagram", () => {
  assert.equal(isAnagram("anagram", "nagaram"), true);
  assert.equal(isAnagram("rat", "car"), false);
  assert.equal(isAnagram("a", "ab"), false);
  assert.equal(isAnagram("aacc", "ccac"), false);
});
