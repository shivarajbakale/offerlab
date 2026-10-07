/**
 * 150. Evaluate Reverse Polish Notation
 * Difficulty: Medium
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/evaluate-reverse-polish-notation/
 *
 * Given an array of string `tokens` representing an arithmetic expression in
 * Reverse Polish Notation, evaluate it and return the integer result.
 * Operators are '+', '-', '*', '/'. Division truncates toward zero. The input
 * is always a valid expression and no division by zero occurs.
 *
 * Example 1:
 *   Input: tokens = ["2", "1", "+", "3", "*"]
 *   Output: 9   ((2 + 1) * 3)
 *
 * Example 2:
 *   Input: tokens = ["4", "13", "5", "/", "+"]
 *   Output: 6   (4 + (13 / 5))
 *
 * Example 3:
 *   Input: tokens = ["10","6","9","3","+","-11","*","/","*","17","+","5","+"]
 *   Output: 22
 *
 * Constraints:
 *   1 <= tokens.length <= 10^4
 *   tokens[i] is an operator or an integer in [-200, 200].
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function evalRPN(tokens: string[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("150. Evaluate Reverse Polish Notation", () => {
  assert.equal(evalRPN(["2", "1", "+", "3", "*"]), 9);
  assert.equal(evalRPN(["4", "13", "5", "/", "+"]), 6);
  assert.equal(
    evalRPN(["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]),
    22,
  );
  assert.equal(evalRPN(["42"]), 42);
  assert.equal(evalRPN(["-7", "2", "/"]), -3);
});
