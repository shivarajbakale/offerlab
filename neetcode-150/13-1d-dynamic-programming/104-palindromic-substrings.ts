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
// @goal how many substrings of "{s}" read the same both ways?
export function countSubstrings(s: string): number {
  // @why Running total of palindromes found.
  // @phase Setup
  // @say Testing all n² substrings one by one costs n each, n³ total. But a palindrome is a smaller palindrome plus one matching letter on each side, so grow outward from each centre: every successful step is one new palindrome, and the first mismatch ends that centre.
  let count = 0;

  // @why Grow outward from a centre; each step where both sides match is one more palindrome.
  // @goal {l === r ? "around the letter \"" + s[l] + "\" at index " + l : "between indices " + l + " and " + r}, how many palindromes share this centre?
  const expand = (l: number, r: number): void => {
    // @why Stop at the edges or the first mismatch, because a bigger one can't be a palindrome then.
    // @yes {l === r ? "A single letter, \"" + s[l] + "\", is always a palindrome." : r - l === 1 ? "s[" + l + "] and s[" + r + "] are both \"" + s[l] + "\", so \"" + s.slice(l, r + 1) + "\" is a palindrome." : "s[" + l + "] and s[" + r + "] are both \"" + s[l] + "\" around a palindrome, so \"" + s.slice(l, r + 1) + "\" is one too."}
    // @no {l < 0 || r >= s.length ? "Hit the edge of the string" : "s[" + l + "] = \"" + s[l] + "\" but s[" + r + "] = \"" + s[r] + "\""}. Every wider string around this centre contains these ends, so no more palindromes here.
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      // @why This range matches, so it is one more palindrome.
      // @say Count "{s.slice(l, r + 1)}" (indices {l}..{r}). Each centre-and-width pair is a different position range, so nothing is counted twice.
      // @then {count} {count === 1 ? "palindrome" : "palindromes"} so far.
      count++; // @ask count // @moment palindrome {s.slice(l, r + 1)}
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
  // @no All centres are tried. Every palindrome has exactly one centre, so each was counted exactly once.
  for (let i = 0; i < s.length; i++) {
    // @why Odd-length palindromes have one middle character.
    // @say Odd lengths: centre on the letter "{s[i]}" itself.
    expand(i, i); // odd length
    // @why Even-length palindromes have a middle between two characters.
    // @say Even lengths: centre on the gap between index {i} and {i + 1}. A palindrome like "aa" has no middle letter, so the odd case alone would miss it.
    expand(i, i + 1); // even length
  }
  // @why Total of all palindromic substrings.
  // @phase Answer
  // @returns {count}: every centre was grown until it broke, in O(n²) time and O(1) space.
  return count;
}

test("647. Palindromic Substrings", () => {
  assert.equal(countSubstrings("abc"), 3);
  assert.equal(countSubstrings("aaa"), 6);
  assert.equal(countSubstrings("a"), 1);
  assert.equal(countSubstrings("abba"), 6);
});
