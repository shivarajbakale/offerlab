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
 *
 * Pattern: expand-around-center
 * Key insight: Each successful expansion from a center is a new, distinct palindromic
 *   substring, so the count is just the number of expansions. No substring is checked
 *   from scratch.
 * Real world: Text-analysis or DNA tools counting all mirrored motifs in a sequence as a
 *   feature, without building a quadratic table.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule count is how many palindromes were found; inside the loop s[l..r] is one
// @why Returns how many substrings are palindromes (same position range counts separately).
export function countSubstrings(s: string): number {
  // @why Running total of palindromes found.
  let count = 0;

  // @why Grow outward from a centre; each step where both sides match is one more palindrome.
  const expand = (l: number, r: number): void => {
    // @why Stop at the edges or the first mismatch, because a bigger one can't be a palindrome then.
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      // @why This range matches, so it is one more palindrome.
      count++; // @ask count // @moment palindrome {s.slice(l, r + 1)}
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
  // @why Total of all palindromic substrings.
  return count;
}

test("647. Palindromic Substrings", () => {
  assert.equal(countSubstrings("abc"), 3);
  assert.equal(countSubstrings("aaa"), 6);
  assert.equal(countSubstrings("a"), 1);
  assert.equal(countSubstrings("abba"), 6);
});
