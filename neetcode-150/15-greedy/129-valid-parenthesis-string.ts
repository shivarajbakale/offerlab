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
 *
 * Approach: Greedy range of open counts
 *   Track the min and max possible number of unmatched '(' so far.
 *   '(' raises both; ')' lowers both; '*' lowers min (as ')') and raises max
 *   (as '('). If max goes negative, too many ')' -> invalid. Clamp min at 0,
 *   since a negative count is never a valid choice. Valid if min ends at 0.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: greedy
 * Key insight: You do not need to decide what each '*' is. Track the range [min, max] of
 *   possible open counts; any value in between is achievable. Fail if max goes negative,
 *   clamp min at 0, and succeed if 0 is still in range at the end.
 * Real world: A lenient parser or editor that tolerates wildcard or unknown tokens,
 *   checking whether some interpretation of them makes the brackets balance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns true if the string can be a valid parentheses string when each `*` is `(`, `)` or empty.
export function checkValidString(s: string): boolean {
  // @why `minOpen` is the fewest unmatched `(` possible so far (treating `*` as `)` when helpful).
  let minOpen = 0;
  // @why `maxOpen` is the most unmatched `(` possible so far (treating `*` as `(`).
  let maxOpen = 0;
  // @why Look at each character once.
  for (const c of s) {
    // @why A real `(` always adds one open bracket.
    if (c === "(") {
      // @why Both the lowest and highest counts go up by one.
      minOpen++;
      maxOpen++;
    // @why A real `)` always closes one open bracket.
    } else if (c === ")") {
      // @why Both counts go down by one.
      minOpen--;
      maxOpen--;
    // @why A `*` could be `)`, `(` or nothing, so the range widens.
    } else {
      // @why As `)`, it lowers the minimum.
      minOpen--;
      // @why As `(`, it raises the maximum.
      maxOpen++;
    }
    // @why Even if every `*` was `(`, there are too many `)`, so it is invalid for sure.
    if (maxOpen < 0) return false;
    // @why We cannot have a negative number of open brackets, so the lowest count stops at 0.
    if (minOpen < 0) minOpen = 0;
  }
  // @why Valid only if it is possible to end with zero unmatched `(`.
  return minOpen === 0;
}

test("678. Valid Parenthesis String", () => {
  assert.equal(checkValidString("()"), true);
  assert.equal(checkValidString("(*)"), true);
  assert.equal(checkValidString("(*))"), true);
  assert.equal(checkValidString(")("), false);
  assert.equal(checkValidString("((*"), false);
});
