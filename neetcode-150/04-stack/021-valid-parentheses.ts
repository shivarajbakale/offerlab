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
 *
 * Pattern: stack
 * Key insight: Brackets close in reverse order of opening, so the only opener a closer
 *   may match is the most recent unmatched one, which is exactly the top of a stack.
 * Real world: Code editors and linters matching brackets and HTML tags to highlight pairs
 *   and report unclosed blocks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Map each closing bracket to the opener it needs, so matching is one lookup.
const OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

// @rule the stack holds openers still waiting for their closer, newest on top
// @why Returns true only if every bracket is closed correctly and in order.
export function isValid(s: string): boolean {
  // @why The stack holds openers still waiting for their closer.
  const stack: string[] = [];
  // @why Look at the string one bracket at a time, left to right.
  for (const ch of s) {
    // @why If this is a closer, `open` is the opener it needs; openers have no entry, so this is undefined.
    const open = OPENER[ch];
    // @why An opener has to wait, so push it. A closer must match the newest opener, so pop and compare; a mismatch (or empty stack) means invalid.
    if (open === undefined) stack.push(ch); // @ask stack.length // @say '{ch}' opens a bracket; push it and wait for its closer
    else if (stack.pop() !== open) return false; // @moment '{ch}' needs '{open}' on top // @say '{ch}' must close the most recent opener, which must be '{open}'
  }
  // @why Any opener still left on the stack never got closed, so the string is only valid if it is empty.
  return stack.length === 0; // @say Valid only if every opener was closed
}

test("20. Valid Parentheses", () => {
  assert.equal(isValid("()"), true);
  assert.equal(isValid("()[]{}"), true);
  assert.equal(isValid("(]"), false);
  assert.equal(isValid("([])"), true);
  assert.equal(isValid("(("), false);
  assert.equal(isValid("]"), false);
});
