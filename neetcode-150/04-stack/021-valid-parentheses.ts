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
 *
 * Approach: Stack
 *   Push open brackets. On a close bracket, the top of the stack must be its
 *   matching opener; pop it. The string is valid if the stack ends empty.
 *
 * Time: O(n)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function isValid(s: string): boolean {
  const stack: string[] = [];
  for (const ch of s) {
    const open = OPENER[ch];
    if (open === undefined) stack.push(ch);
    else if (stack.pop() !== open) return false;
  }
  return stack.length === 0;
}

test("20. Valid Parentheses", () => {
  assert.equal(isValid("()"), true);
  assert.equal(isValid("()[]{}"), true);
  assert.equal(isValid("(]"), false);
  assert.equal(isValid("([])"), true);
  assert.equal(isValid("(("), false);
  assert.equal(isValid("]"), false);
});
