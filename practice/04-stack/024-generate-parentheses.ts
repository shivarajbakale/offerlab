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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function generateParenthesis(n: number): string[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("22. Generate Parentheses", () => {
  assert.deepEqual(
    generateParenthesis(3).sort(),
    ["((()))", "(()())", "(())()", "()(())", "()()()"].sort(),
  );
  assert.deepEqual(generateParenthesis(1), ["()"]);
  assert.equal(generateParenthesis(4).length, 14); // Catalan(4)
});
