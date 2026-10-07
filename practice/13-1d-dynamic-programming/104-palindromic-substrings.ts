/**
 * 647. Palindromic Substrings
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/palindromic-substrings/
 *
 * Given a string `s`, return how many of its substrings are palindromes.
 * Substrings at different positions count separately even if they contain
 * the same characters.
 *
 * Example 1:
 *   Input: s = "abc"
 *   Output: 3   ("a", "b", "c")
 *
 * Example 2:
 *   Input: s = "aaa"
 *   Output: 6   ("a", "a", "a", "aa", "aa", "aaa")
 *
 * Constraints:
 *   1 <= s.length <= 1000
 *   s consists of lowercase English letters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function countSubstrings(s: string): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("647. Palindromic Substrings", () => {
  assert.equal(countSubstrings("abc"), 3);
  assert.equal(countSubstrings("aaa"), 6);
  assert.equal(countSubstrings("a"), 1);
  assert.equal(countSubstrings("abba"), 6);
});
