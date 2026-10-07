/**
 * 10. Regular Expression Matching
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/regular-expression-matching/
 *
 * Implement regex matching for a string `s` and pattern `p` supporting:
 *   '.' matches any single character
 *   '*' matches zero or more of the element right before it
 * The match must cover the entire string, not just part of it.
 *
 * Example 1:
 *   Input: s = "aa", p = "a"
 *   Output: false
 *
 * Example 2:
 *   Input: s = "aa", p = "a*"
 *   Output: true
 *
 * Example 3:
 *   Input: s = "ab", p = ".*"
 *   Output: true
 *
 * Constraints:
 *   1 <= s.length <= 20
 *   1 <= p.length <= 20
 *   s has only lowercase letters; p has lowercase letters, '.' and '*'.
 *   Every '*' is preceded by a valid character.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isMatch(s: string, p: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("10. Regular Expression Matching", () => {
  assert.equal(isMatch("aa", "a"), false);
  assert.equal(isMatch("aa", "a*"), true);
  assert.equal(isMatch("ab", ".*"), true);
  assert.equal(isMatch("aab", "c*a*b"), true);
  assert.equal(isMatch("mississippi", "mis*is*p*."), false);
});
