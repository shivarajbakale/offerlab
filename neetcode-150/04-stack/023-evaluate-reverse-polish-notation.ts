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
 *
 * Approach: Stack
 *   Push numbers. On an operator, pop the right operand then the left one,
 *   apply the operator, and push the result. The final stack value is the
 *   answer.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: stack
 * Key insight: In postfix notation every operator applies to the two most recent results,
 *   so a stack holds exactly the pending operands and no parentheses or precedence rules
 *   are needed.
 * Real world: Stack-based virtual machines like the JVM and calculators evaluate compiled
 *   expressions in postfix order with an operand stack.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function evalRPN(tokens: string[]): number {
  const stack: number[] = [];
  for (const t of tokens) {
    if (t === "+" || t === "-" || t === "*" || t === "/") {
      const b = stack.pop()!;
      const a = stack.pop()!;
      if (t === "+") stack.push(a + b);
      else if (t === "-") stack.push(a - b);
      else if (t === "*") stack.push(a * b);
      else stack.push(Math.trunc(a / b));
    } else {
      stack.push(Number(t));
    }
  }
  return stack[0] + 0; // normalize -0
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
