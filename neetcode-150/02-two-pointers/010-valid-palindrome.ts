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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

function isAlphaNum(ch: string): boolean {
  return /[a-z0-9]/i.test(ch);
}

export function isPalindrome(s: string): boolean {
  let l = 0;
  let r = s.length - 1;
  while (l < r) {
    while (l < r && !isAlphaNum(s[l])) l++;
    while (l < r && !isAlphaNum(s[r])) r--;
    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false;
    l++;
    r--;
  }
  return true;
}

test("125. Valid Palindrome", () => {
  assert.equal(isPalindrome("A man, a plan, a canal: Panama"), true);
  assert.equal(isPalindrome("race a car"), false);
  assert.equal(isPalindrome(" "), true);
  assert.equal(isPalindrome("0P"), false);
});
