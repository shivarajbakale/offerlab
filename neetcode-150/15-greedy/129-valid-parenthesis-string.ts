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

// @rule minOpen..maxOpen covers every unmatched '(' count some choice of * could give
// @why Returns true if the string can be a valid parentheses string when each `*` is `(`, `)` or empty.
// @goal can "{s}" be balanced if each * is chosen as (, ) or nothing?
export function checkValidString(s: string): boolean {
  // @why `minOpen` is the fewest unmatched `(` possible so far (treating `*` as `)` when helpful).
  // @phase Setup: a range of possible open counts
  // @say Trying all three choices for every * is 3^k. But the only thing a choice affects is how many ( are still open, so track the lowest and highest open count any choice could give, and every count in between is reachable too.
  let minOpen = 0;
  // @why `maxOpen` is the most unmatched `(` possible so far (treating `*` as `(`).
  let maxOpen = 0;
  // @why Look at each character once.
  // @phase One pass: shift or widen the range per character
  // @say Next character: "{c}". Open count could be anywhere in {minOpen}..{maxOpen}.
  for (const c of s) {
    // @why A real `(` always adds one open bracket.
    // @yes A real "(": no choice involved, so every possible count goes up by one.
    // @no Not a "(".
    // @say {c === "(" ? "A real (: no choice involved, so every possible count goes up by one." : "Not a (, so check what else it is."}
    if (c === "(") {
      // @why Both the lowest and highest counts go up by one.
      // @say Lowest possible count: {minOpen} → {minOpen + 1}.
      minOpen++;
      // @say Highest possible count: {maxOpen} → {maxOpen + 1}.
      maxOpen++;
    // @why A real `)` always closes one open bracket.
    // @yes A real ")": every possible count goes down by one.
    // @no A "*": it could open, close or vanish, so the range widens by one on each side.
    // @say {c === ")" ? "A real ): no choice involved, so every possible count goes down by one." : "A *: it could open, close or vanish, so the range widens by one on each side."}
    } else if (c === ")") {
      // @why Both counts go down by one.
      // @say Lowest possible count: {minOpen} → {minOpen - 1}.
      minOpen--;
      // @say Highest possible count: {maxOpen} → {maxOpen - 1}.
      maxOpen--;
    // @why A `*` could be `)`, `(` or nothing, so the range widens.
    } else {
      // @why As `)`, it lowers the minimum.
      // @say Treated as ), it closes one: the lowest count drops to {minOpen - 1}.
      minOpen--;
      // @why As `(`, it raises the maximum.
      // @say Treated as (, it opens one: the highest count rises to {maxOpen + 1}. Treated as nothing, it keeps every count in between reachable.
      maxOpen++; // @ask maxOpen
    }
    // @why Even if every `*` was `(`, there are too many `)`, so it is invalid for sure.
    // @yes Even the most generous choice leaves {maxOpen} open: more ) than anything could have opened. No later character can fix a ) that already closed nothing.
    // @no The most generous choice leaves {maxOpen} open, so some choice of the * still has every ) matched: the prefix can still be valid.
    // @returns false: this prefix has a ) that nothing can match.
    if (maxOpen < 0) return false;
    // @why We cannot have a negative number of open brackets, so the lowest count stops at 0.
    // @yes The low end hit {minOpen}, but a count below 0 means a ) with nothing to close. Those choices are invalid, so the lowest real count is 0.
    // @no Possible open counts: {minOpen}..{maxOpen}, all of them legal.
    if (minOpen < 0) minOpen = 0; // @ask minOpen
  }
  // @why Valid only if it is possible to end with zero unmatched `(`.
  // @phase Answer
  // @returns {minOpen === 0 ? "true: some choice of the * ends with 0 open, so everything closes." : "false: even the best choice leaves at least " + minOpen + " ( unclosed."}
  return minOpen === 0;
}

test("678. Valid Parenthesis String", () => {
  assert.equal(checkValidString("()"), true);
  assert.equal(checkValidString("(*)"), true);
  assert.equal(checkValidString("(*))"), true);
  assert.equal(checkValidString(")("), false);
  assert.equal(checkValidString("((*"), false);
});
