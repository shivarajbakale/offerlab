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

// @why Evaluates a postfix (RPN) expression given as string tokens.
export function evalRPN(tokens: string[]): number {
  // @why The stack holds numbers that are waiting for an operator.
  const stack: number[] = [];
  // @why Read tokens one by one, left to right.
  for (const t of tokens) {
    // @why An operator works on the two newest numbers; anything else is a number.
    if (t === "+" || t === "-" || t === "*" || t === "/") {
      // @why The right operand was pushed last, so it comes off first.
      const b = stack.pop()!;
      // @why The left operand is the one just below it. Order matters for `-` and `/`.
      const a = stack.pop()!;
      // @why Apply the operator and push the result, so it can be an operand for a later operator.
      if (t === "+") stack.push(a + b);
      else if (t === "-") stack.push(a - b);
      else if (t === "*") stack.push(a * b);
      // @why Division must cut toward zero, which `Math.trunc` does (plain `/` gives decimals).
      else stack.push(Math.trunc(a / b));
    } else {
      // @why A number is not used yet, so convert it and push it.
      stack.push(Number(t));
    }
  }
  // @why The single value left is the answer; `+ 0` turns -0 into 0.
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
