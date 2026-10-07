/**
 * 678. Valid Parenthesis String
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/valid-parenthesis-string/
 *
 * Given a string `s` containing only '(', ')' and '*', return true if it can
 * be valid. Each '*' may be treated as '(', ')' or an empty string. A valid
 * string has every '(' closed by a later ')' and every ')' matched by an
 * earlier '('.
 *
 * Example 1:
 *   Input: s = "()"
 *   Output: true
 *
 * Example 2:
 *   Input: s = "(*)"
 *   Output: true
 *
 * Example 3:
 *   Input: s = "(*))"
 *   Output: true
 *
 * Constraints:
 *   1 <= s.length <= 100
 *   s[i] is '(', ')' or '*'.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function checkValidString(s: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("678. Valid Parenthesis String", () => {
  assert.equal(checkValidString("()"), true);
  assert.equal(checkValidString("(*)"), true);
  assert.equal(checkValidString("(*))"), true);
  assert.equal(checkValidString(")("), false);
  assert.equal(checkValidString("((*"), false);
});
