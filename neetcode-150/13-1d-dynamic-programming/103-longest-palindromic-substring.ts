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

// @viz best:maxLen
// @rule inside the loop s[l..r] is a palindrome; start and maxLen mark the longest one seen
// @why Returns the longest substring that reads the same forwards and backwards.
// @goal what is the longest palindrome inside "{s}"?
export function longestPalindrome(s: string): string {
  // @why `start` is where the best palindrome found so far begins.
  // @phase Setup: remember only the best palindrome so far
  // @say Checking every substring is n² substrings × n to test each = n³. But a palindrome is a smaller palindrome with one matching letter added on each side, so grow outward from each centre and stop at the first mismatch: n² total.
  let start = 0;
  // @why `maxLen` is the length of the best palindrome found so far.
  let maxLen = 0;

  // @why Grow outward from a centre while both sides match; every match is a palindrome (inner part was one).
  // @goal {l === r ? "around the letter \"" + s[l] + "\" at index " + l : "between indices " + l + " and " + r}, how far does a palindrome stretch?
  const expand = (l: number, r: number): void => {
    // @why Stop at the edges or at the first mismatch, since a palindrome needs matching ends.
    // @yes {l === r ? "A single letter, \"" + s[l] + "\", is always a palindrome." : r - l === 1 ? "s[" + l + "] and s[" + r + "] are both \"" + s[l] + "\", so \"" + s.slice(l, r + 1) + "\" is a palindrome." : "s[" + l + "] and s[" + r + "] are both \"" + s[l] + "\". The inside was already a palindrome, so \"" + s.slice(l, r + 1) + "\" is one too."}
    // @no {l < 0 || r >= s.length ? "Hit the edge of the string" : "s[" + l + "] = \"" + s[l] + "\" but s[" + r + "] = \"" + s[r] + "\""}. Any longer string around this centre would contain these two ends too, so none of them can be a palindrome. Stop here.
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      // @why Only remember this palindrome if it beats the longest one so far.
      // @yes "{s.slice(l, r + 1)}" has length {r - l + 1}, longer than the best so far ({maxLen}).
      // @no "{s.slice(l, r + 1)}" has length {r - l + 1}, no longer than the best so far ({maxLen}). Keep the old one.
      if (r - l + 1 > maxLen) {
        // @why Save where the new best begins.
        start = l; // @moment new best {s.slice(l, r + 1)}
        // @why Save how long the new best is.
        // @then New best: "{s.slice(start, start + maxLen)}", length {maxLen}.
        maxLen = r - l + 1; // @ask maxLen
      }
      // @why Step the left edge outward.
      // @say Try one letter wider on each side: indices {l - 1} and {r + 1}.
      l--;
      // @why Step the right edge outward.
      r++;
    }
  };

  // @why Every palindrome has a centre, so try each position as a centre.
  // @phase Try every centre
  // @yes Index {i} ("{s[i]}") is the next centre to try.
  // @no All {2 * s.length} centres are tried. Every palindrome has one of them as its middle, so none was missed.
  for (let i = 0; i < s.length; i++) {
    // @why Odd-length palindromes have one middle character.
    // @say Odd lengths: centre on the letter "{s[i]}" itself.
    expand(i, i); // odd length
    // @why Even-length palindromes have a middle between two characters.
    // @say Even lengths: centre on the gap between index {i} and {i + 1}. A palindrome like "bb" has no middle letter, so the odd case alone would miss it.
    expand(i, i + 1); // even length
  }
  // @why Cut out the best palindrome using the saved start and length.
  // @phase Answer
  // @returns "{s.slice(start, start + maxLen)}": the longest palindrome over all centres, from index {start}, length {maxLen}.
  return s.slice(start, start + maxLen);
}

test("5. Longest Palindromic Substring", () => {
  assert.ok(["bab", "aba"].includes(longestPalindrome("babad")));
  assert.equal(longestPalindrome("cbbd"), "bb");
  assert.equal(longestPalindrome("a"), "a");
  assert.equal(longestPalindrome("forgeeksskeegfor"), "geeksskeeg");
});
