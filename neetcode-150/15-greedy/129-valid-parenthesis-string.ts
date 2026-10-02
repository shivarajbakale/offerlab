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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function checkValidString(s: string): boolean {
  let minOpen = 0;
  let maxOpen = 0;
  for (const c of s) {
    if (c === "(") {
      minOpen++;
      maxOpen++;
    } else if (c === ")") {
      minOpen--;
      maxOpen--;
    } else {
      minOpen--;
      maxOpen++;
    }
    if (maxOpen < 0) return false;
    if (minOpen < 0) minOpen = 0;
  }
  return minOpen === 0;
}

test("678. Valid Parenthesis String", () => {
  assert.equal(checkValidString("()"), true);
  assert.equal(checkValidString("(*)"), true);
  assert.equal(checkValidString("(*))"), true);
  assert.equal(checkValidString(")("), false);
  assert.equal(checkValidString("((*"), false);
});
