/**
 * 125. Valid Palindrome
 * Difficulty: Easy
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/valid-palindrome/
 *
 * A phrase is a palindrome if, after lowercasing all letters and removing
 * every non-alphanumeric character, it reads the same forward and backward.
 * Given a string `s`, return true if it is a palindrome, otherwise false.
 *
 * Example 1:
 *   Input: s = "A man, a plan, a canal: Panama"
 *   Output: true
 *
 * Example 2:
 *   Input: s = "race a car"
 *   Output: false
 *
 * Example 3:
 *   Input: s = " "
 *   Output: true   (empty after cleaning)
 *
 * Constraints:
 *   1 <= s.length <= 2 * 10^5
 *   s consists only of printable ASCII characters.
 *
 * Approach: Two pointers
 *   Move left and right pointers inward, skipping non-alphanumeric chars, and
 *   compare the lowercase characters at each step.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: two-pointers
 * Key insight: A palindrome mirrors around its center, so comparing the outermost valid
 *   characters and moving inward checks it in place; skipping punctuation on each side
 *   keeps the pointers aligned.
 * Real world: A search engine normalizing a query and testing for symmetric patterns
 *   without allocating a cleaned copy of the string.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Helper that says whether a character counts; spaces and punctuation are ignored.
function isAlphaNum(ch: string): boolean {
  // @why A letter or digit, in any case.
  return /[a-z0-9]/i.test(ch);
}

// @rule every letter outside l..r already matches its mirror
// @why Return true if the text reads the same both ways, ignoring symbols and case.
export function isPalindrome(s: string): boolean {
  // @why `l` starts at the front.
  let l = 0;
  // @why `r` starts at the back.
  let r = s.length - 1;
  // @why Stop when the pointers meet; the middle needs no check.
  while (l < r) {
    // @why Skip symbols on the left.
    while (l < r && !isAlphaNum(s[l])) l++; // @ask l
    // @why Skip symbols on the right.
    while (l < r && !isAlphaNum(s[r])) r--; // @ask r
    // @why The two real characters must match, ignoring upper or lower case.
    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false;
    // @why Move both pointers inward to the next pair.
    l++;
    r--;
  }
  // @why Every pair matched, so it is a palindrome.
  return true;
}

test("125. Valid Palindrome", () => {
  assert.equal(isPalindrome("A man, a plan, a canal: Panama"), true);
  assert.equal(isPalindrome("race a car"), false);
  assert.equal(isPalindrome(" "), true);
  assert.equal(isPalindrome("0P"), false);
});
