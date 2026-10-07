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
// @goal is every bracket in {JSON.stringify(s)} closed by the right partner, in the right order?
export function isValid(s: string): boolean {
  // @why The stack holds openers still waiting for their closer.
  // @phase Setup: a stack of openers waiting to be closed
  // @say Counting each bracket type isn't enough: "([)]" has balanced counts but closes in the wrong order. The rule is that a closer must match the most recent unclosed opener, which is exactly what the top of a stack holds.
  const stack: string[] = [];
  // @why Look at the string one bracket at a time, left to right.
  // @phase Scan: openers wait, closers must match the newest opener
  // @say Next bracket: {JSON.stringify(ch)}.
  for (const ch of s) {
    // @why If this is a closer, `open` is the opener it needs; openers have no entry, so this is undefined.
    // @say {ch === "(" || ch === "[" || ch.charCodeAt(0) === 123 ? JSON.stringify(ch) + " is an opener, so it has no partner to look up." : JSON.stringify(ch) + " is a closer; look up the opener it needs, " + JSON.stringify(ch === ")" ? "(" : ch === "]" ? "[" : String.fromCharCode(123)) + "."}
    const open = OPENER[ch];
    // @why An opener has to wait, so push it. A closer must match the newest opener, so pop and compare; a mismatch (or empty stack) means invalid.
    // @yes {JSON.stringify(ch)} opens a bracket. Its closer can only come later, so push it and wait.
    // @no {JSON.stringify(ch)} is a closer, so it must close the most recent unclosed opener.
    // @then {open === undefined ? "Openers waiting, oldest to newest: " + stack.join(" ") + "." : ""}
    if (open === undefined) stack.push(ch); // @ask stack.length
    // @yes {JSON.stringify(ch)} needs {JSON.stringify(open)} as the newest waiting opener, but a different opener (or none) was on top. Something inside was left open or crossed over.
    // @no The newest waiting opener is {JSON.stringify(open)}, the partner {JSON.stringify(ch)} needs. That pair is closed and leaves the stack.
    // @returns false: {JSON.stringify(ch)} arrived when {JSON.stringify(open)} was not the newest open bracket.
    // @then {stack.length ? "Still waiting, oldest to newest: " + stack.join(" ") + "." : ""}
    else if (stack.pop() !== open) return false; // @moment '{ch}' needs '{open}' on top
  }
  // @why Any opener still left on the stack never got closed, so the string is only valid if it is empty.
  // @phase Answer
  // @returns {stack.length === 0 ? "true: every opener was closed by its partner, in order." : "false: " + stack.join(" ") + " never got " + (stack.length === 1 ? "its closer" : "their closers") + "."}
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
