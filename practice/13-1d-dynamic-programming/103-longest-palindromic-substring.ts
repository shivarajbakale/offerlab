/**
 * 5. Longest Palindromic Substring
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/longest-palindromic-substring/
 *
 * Given a string `s`, return the longest contiguous substring of `s` that
 * reads the same forwards and backwards. If several have the maximum length,
 * any one of them is accepted.
 *
 * Example 1:
 *   Input: s = "babad"
 *   Output: "bab"   ("aba" is also valid)
 *
 * Example 2:
 *   Input: s = "cbbd"
 *   Output: "bb"
 *
 * Constraints:
 *   1 <= s.length <= 1000
 *   s consists of digits and English letters only.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestPalindrome(s: string): string {
  // TODO: implement
  throw new Error("Not implemented");
}

test("5. Longest Palindromic Substring", () => {
  assert.ok(["bab", "aba"].includes(longestPalindrome("babad")));
  assert.equal(longestPalindrome("cbbd"), "bb");
  assert.equal(longestPalindrome("a"), "a");
  assert.equal(longestPalindrome("forgeeksskeegfor"), "geeksskeeg");
});
