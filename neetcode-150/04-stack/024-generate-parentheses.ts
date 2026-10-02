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

export function generateParenthesis(n: number): string[] {
  const result: string[] = [];
  const stack: string[] = [];

  const backtrack = (open: number, close: number) => {
    if (open === n && close === n) {
      result.push(stack.join(""));
      return;
    }
    if (open < n) {
      stack.push("(");
      backtrack(open + 1, close);
      stack.pop();
    }
    if (close < open) {
      stack.push(")");
      backtrack(open, close + 1);
      stack.pop();
    }
  };

  backtrack(0, 0);
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
