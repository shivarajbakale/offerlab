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
 *
 * Approach: Expand around center
 *   For each of the 2n - 1 centers (each character and each gap), expand
 *   outward while the ends match; every successful expansion is one more
 *   palindromic substring.
 *
 * Time: O(n^2)   Space: O(1)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function countSubstrings(s: string): number {
  let count = 0;

  const expand = (l: number, r: number): void => {
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      count++;
      l--;
      r++;
    }
  };

  for (let i = 0; i < s.length; i++) {
    expand(i, i); // odd length
    expand(i, i + 1); // even length
  }
  return count;
}

test("647. Palindromic Substrings", () => {
  assert.equal(countSubstrings("abc"), 3);
  assert.equal(countSubstrings("aaa"), 6);
  assert.equal(countSubstrings("a"), 1);
  assert.equal(countSubstrings("abba"), 6);
});
