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
// @goal does {JSON.stringify(ch)} count toward the palindrome?
function isAlphaNum(ch: string): boolean {
  // @why A letter or digit, in any case.
  // @say The problem only compares letters and digits; {JSON.stringify(ch)} {/[a-z0-9]/i.test(ch) ? "is one of those" : "is a space or symbol"}.
  // @returns {/[a-z0-9]/i.test(ch) ? "true: " + JSON.stringify(ch) + " must be matched against its mirror" : "false: " + JSON.stringify(ch) + " is skipped, as if it weren't there"}.
  return /[a-z0-9]/i.test(ch);
}

// @rule every letter outside l..r already matches its mirror
// @why Return true if the text reads the same both ways, ignoring symbols and case.
// @goal does "{s}" read the same forwards and backwards, counting only letters and digits?
export function isPalindrome(s: string): boolean {
  // @why `l` starts at the front.
  // @phase Setup: one pointer at each end
  // @say Building a cleaned, reversed copy and comparing costs O(n) extra space. Instead, compare the text against itself from both ends, skipping symbols in place.
  let l = 0;
  // @why `r` starts at the back.
  let r = s.length - 1;
  // @why Stop when the pointers meet; the middle needs no check.
  // @phase Squeeze inward: compare the outermost unchecked letters
  // @yes Positions {l} and {r} are not yet checked against each other, so the answer is still open.
  // @no The pointers met or crossed. Every letter has been compared with its mirror, and a middle letter (if any) mirrors itself.
  while (l < r) {
    // @why Skip symbols on the left.
    // @yes {JSON.stringify(s[l])} at {l} is a space or symbol. It plays no part in the palindrome, so step past it.
    // @no {l >= r ? "The pointers met, so there is nothing left to skip." : JSON.stringify(s[l]) + " at " + l + " is a real character, so the left side is ready to compare."}
    // @say {l >= r ? "The pointers met, so there is nothing left to skip." : /[a-z0-9]/i.test(s[l]) ? JSON.stringify(s[l]) + " at " + l + " is a real character, so the left side is ready to compare." : JSON.stringify(s[l]) + " at " + l + " is a space or symbol. It plays no part in the palindrome, so step past it."}
    while (l < r && !isAlphaNum(s[l])) l++; // @ask l
    // @why Skip symbols on the right.
    // @yes {JSON.stringify(s[r])} at {r} is a space or symbol, so skip it from the right as well.
    // @no {l >= r ? "The pointers met, so there is nothing left to skip." : JSON.stringify(s[r]) + " at " + r + " is a real character, so the right side is ready too."}
    // @say {l >= r ? "The pointers met, so there is nothing left to skip." : /[a-z0-9]/i.test(s[r]) ? JSON.stringify(s[r]) + " at " + r + " is a real character, so the right side is ready too." : JSON.stringify(s[r]) + " at " + r + " is a space or symbol, so skip it from the right as well."}
    while (l < r && !isAlphaNum(s[r])) r--; // @ask r
    // @why The two real characters must match, ignoring upper or lower case.
    // @yes {JSON.stringify(s[l])} and {JSON.stringify(s[r])} differ even ignoring case. A palindrome needs these mirror positions equal, so one mismatch settles it.
    // @no {JSON.stringify(s[l])} and {JSON.stringify(s[r])} match (ignoring case). This mirror pair is fine; the answer depends only on what lies between them.
    // @returns false: the mirror pair {JSON.stringify(s[l])} / {JSON.stringify(s[r])} breaks the symmetry, so nothing inside can fix it.
    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false;
    // @why Move both pointers inward to the next pair.
    // @say Both ends are settled, so drop them and look at the next pair in.
    l++;
    // @then {l <= r ? "Everything outside " + l + ".." + r + " matches its mirror." : "The pointers crossed: every mirror pair has matched."}
    r--;
  }
  // @why Every pair matched, so it is a palindrome.
  // @phase Answer
  // @returns true: every letter was checked against its mirror once and all matched, in O(n) time and O(1) space.
  return true;
}

test("125. Valid Palindrome", () => {
  assert.equal(isPalindrome("A man, a plan, a canal: Panama"), true);
  assert.equal(isPalindrome("race a car"), false);
  assert.equal(isPalindrome(" "), true);
  assert.equal(isPalindrome("0P"), false);
});
