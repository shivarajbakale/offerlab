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
 *
 * Approach: Expand around center
 *   Every palindrome has a center: a single character (odd length) or a gap
 *   between two characters (even length). For each of the 2n - 1 centers,
 *   expand outward while the ends match and record the longest window.
 *
 * Time: O(n^2)   Space: O(1)
 *
 * Pattern: expand-around-center
 * Key insight: Every palindrome is symmetric around a center, either a character or a gap
 *   between two characters, so only 2n - 1 centers need checking. Expanding stops at the
 *   first mismatch, giving O(n^2) time and O(1) space with no DP table.
 * Real world: Bioinformatics tools finding palindromic DNA sequences, which mark
 *   restriction-enzyme cut sites and hairpin structures.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns the longest substring that reads the same forwards and backwards.
export function longestPalindrome(s: string): string {
  // @why `start` is where the best palindrome found so far begins.
  let start = 0;
  // @why `maxLen` is the length of the best palindrome found so far.
  let maxLen = 0;

  // @why Grow outward from a centre while both sides match; every match is a palindrome (inner part was one).
  const expand = (l: number, r: number): void => {
    // @why Stop at the edges or at the first mismatch, since a palindrome needs matching ends.
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      // @why Only remember this palindrome if it beats the longest one so far.
      if (r - l + 1 > maxLen) {
        // @why Save where the new best begins.
        start = l;
        // @why Save how long the new best is.
        maxLen = r - l + 1;
      }
      // @why Step the left edge outward.
      l--;
      // @why Step the right edge outward.
      r++;
    }
  };

  // @why Every palindrome has a centre, so try each position as a centre.
  for (let i = 0; i < s.length; i++) {
    // @why Odd-length palindromes have one middle character.
    expand(i, i); // odd length
    // @why Even-length palindromes have a middle between two characters.
    expand(i, i + 1); // even length
  }
  // @why Cut out the best palindrome using the saved start and length.
  return s.slice(start, start + maxLen);
}

test("5. Longest Palindromic Substring", () => {
  assert.ok(["bab", "aba"].includes(longestPalindrome("babad")));
  assert.equal(longestPalindrome("cbbd"), "bb");
  assert.equal(longestPalindrome("a"), "a");
  assert.equal(longestPalindrome("forgeeksskeegfor"), "geeksskeeg");
});
