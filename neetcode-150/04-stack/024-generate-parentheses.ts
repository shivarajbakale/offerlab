/**
 * 22. Generate Parentheses
 * Difficulty: Medium
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/generate-parentheses/
 *
 * Given `n` pairs of parentheses, return all combinations of well-formed
 * parentheses strings (in any order).
 *
 * Example 1:
 *   Input: n = 3
 *   Output: ["((()))", "(()())", "(())()", "()(())", "()()()"]
 *
 * Example 2:
 *   Input: n = 1
 *   Output: ["()"]
 *
 * Constraints:
 *   1 <= n <= 8
 *
 * Approach: Backtracking with open/close counts
 *   Build strings character by character using a shared stack of chars.
 *   We may add '(' while open < n, and ')' while close < open. When the
 *   length reaches 2n, record the string.
 *
 * Time: O(4^n / sqrt(n)) (Catalan number of results)   Space: O(n) recursion
 *
 * Pattern: backtracking
 * Key insight: A prefix can still become valid exactly when open <= n and close <= open,
 *   so enforcing those two rules while building prunes every invalid branch and only
 *   valid strings are ever completed.
 * Real world: Test generators enumerating all well-formed nested structures (JSON, XML)
 *   up to a size to fuzz a parser.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule stack is always a valid prefix: close <= open <= n
// @why Returns every well-formed string made of `n` pairs of parentheses.
// @goal what are all the well-formed strings with {n} {n === 1 ? "pair" : "pairs"} of parentheses?
export function generateParenthesis(n: number): string[] {
  // @why Collects the finished strings.
  // @phase Setup
  // @say Generating all 2^{2 * n} strings of ( and ) and filtering out the bad ones wastes most of the work. Instead build left to right and only ever add a character that keeps the prefix fixable, so every string you finish is valid.
  const result: string[] = [];
  // @why The characters of the string being built right now, so we can add and undo one at a time.
  const stack: string[] = [];

  // @why Tries every legal next character; `open` and `close` count what is already used.
  // @goal starting from "{stack.join("")}" ({open} open, {close} closed), which valid strings can it grow into?
  const backtrack = (open: number, close: number) => {
    // @why All pairs used means the string is complete.
    // @phase Choose the next character: ( while any remain, ) only to close one
    // @yes All {n} opens and {n} closes are placed, and every step kept close ≤ open, so "{stack.join("")}" is well formed.
    // @no "{stack.join("")}" has {2 * n - open - close} {2 * n - open - close === 1 ? "character" : "characters"} still to place.
    if (open === n && close === n) {
      // @why Save a copy of the finished string.
      // @say Record "{stack.join("")}" as a string (a copy), since the stack keeps changing.
      result.push(stack.join("")); // @moment found {stack.join("")}
      // @returns nothing; this branch is complete and gave "{stack.join("")}".
      return;
    }
    // @why We can add `(` as long as we have not used all `n` of them.
    // @yes Only {open} of {n} "(" used, so another "(" can still be closed later.
    // @no All {n} "(" are used; only ")" can come next.
    if (open < n) { // @ask open<n
      // @why Choose `(`.
      // @say Choice 1: add "(" to make "{stack.join("") + "("}".
      stack.push("(");
      // @why Explore everything that can follow this choice.
      backtrack(open + 1, close);
      // @why Undo the choice so the next option starts from a clean state.
      // @say Every string starting "{stack.join("")}" is recorded. Undo the "(" so the other choice starts from "{stack.slice(0, -1).join("")}".
      stack.pop();
    }
    // @why A `)` is only legal if there is an unmatched `(` to close, so `close` must stay below `open`.
    // @yes {open - close} "(" {open - close === 1 ? "is" : "are"} still unclosed, so a ")" keeps the prefix valid.
    // @no Every "(" so far is closed ({close} of {open}). A ")" now would have nothing to close.
    if (close < open) { // @ask close<open
      // @why Choose `)`.
      // @say Choice 2: add ")" to make "{stack.join("") + ")"}".
      stack.push(")");
      // @say Explore everything that can follow "{stack.join("")}".
      backtrack(open, close + 1);
      // @say Undo the ")" to return to "{stack.slice(0, -1).join("")}".
      stack.pop();
    }
  };

  // @why Start with an empty string: nothing opened, nothing closed.
  // @phase Run the choices
  // @say Start from the empty string.
  backtrack(0, 0);
  // @phase Answer
  // @returns all {result.length} well-formed strings: every leaf the rules allowed is a valid answer, and none was built twice.
  return result;
}

test("22. Generate Parentheses", () => {
  assert.deepEqual(
    generateParenthesis(3).sort(),
    ["((()))", "(()())", "(())()", "()(())", "()()()"].sort(),
  );
  assert.deepEqual(generateParenthesis(1), ["()"]);
  assert.equal(generateParenthesis(4).length, 14); // Catalan(4)
});
