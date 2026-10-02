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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestPalindrome(s: string): string {
  let start = 0;
  let maxLen = 0;

  const expand = (l: number, r: number): void => {
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      if (r - l + 1 > maxLen) {
        start = l;
        maxLen = r - l + 1;
      }
      l--;
      r++;
    }
  };

  for (let i = 0; i < s.length; i++) {
    expand(i, i); // odd length
    expand(i, i + 1); // even length
  }
  return s.slice(start, start + maxLen);
}

test("5. Longest Palindromic Substring", () => {
  assert.ok(["bab", "aba"].includes(longestPalindrome("babad")));
  assert.equal(longestPalindrome("cbbd"), "bb");
  assert.equal(longestPalindrome("a"), "a");
  assert.equal(longestPalindrome("forgeeksskeegfor"), "geeksskeeg");
});
