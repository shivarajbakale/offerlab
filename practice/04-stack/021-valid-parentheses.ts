/**
 * 20. Valid Parentheses
 * Difficulty: Easy
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/valid-parentheses/
 *
 * Given a string `s` containing only '(', ')', '{', '}', '[' and ']',
 * determine whether it is valid: every open bracket is closed by the same
 * type of bracket, in the correct order, and every close bracket has a
 * matching open bracket.
 *
 * Example 1:
 *   Input: s = "()"
 *   Output: true
 *
 * Example 2:
 *   Input: s = "()[]{}"
 *   Output: true
 *
 * Example 3:
 *   Input: s = "(]"
 *   Output: false
 *
 * Example 4:
 *   Input: s = "([])"
 *   Output: true
 *
 * Constraints:
 *   1 <= s.length <= 10^4
 *   s consists of bracket characters only.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function isValid(s: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("20. Valid Parentheses", () => {
  assert.equal(isValid("()"), true);
  assert.equal(isValid("()[]{}"), true);
  assert.equal(isValid("(]"), false);
  assert.equal(isValid("([])"), true);
  assert.equal(isValid("(("), false);
  assert.equal(isValid("]"), false);
});
