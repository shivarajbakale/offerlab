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

// @rule the stack holds the value of every finished sub-expression, oldest at the bottom
// @why Evaluates a postfix (RPN) expression given as string tokens.
// @goal what does the postfix expression {tokens.join(" ")} evaluate to?
export function evalRPN(tokens: string[]): number {
  // @why The stack holds numbers that are waiting for an operator.
  // @phase Setup: a stack of values waiting for an operator
  // @say Postfix needs no parentheses or precedence rules: an operator always applies to the two most recent values not yet used. "Most recent first" is a stack, so one left-to-right pass is enough.
  const stack: number[] = [];
  // @why Read tokens one by one, left to right.
  // @phase Scan: numbers wait, operators combine the newest two
  // @say Token {JSON.stringify(t)}.
  for (const t of tokens) {
    // @why An operator works on the two newest numbers; anything else is a number.
    // @yes {JSON.stringify(t)} is an operator. Its two operands are the two newest values on the stack: {stack[stack.length - 2]} and {stack[stack.length - 1]}.
    // @no {JSON.stringify(t)} is a number. No operator has claimed it yet, so it waits on the stack.
    if (t === "+" || t === "-" || t === "*" || t === "/") {
      // @why The right operand was pushed last, so it comes off first.
      // @say Pop {stack[stack.length - 1]} as the right operand: it was pushed last.
      const b = stack.pop()!; // @ask b
      // @why The left operand is the one just below it. Order matters for `-` and `/`.
      // @say Pop {stack[stack.length - 1]} as the left operand, the one pushed before {b}{(t === "-" || t === "/") && stack[stack.length - 1] !== b ? ". Order matters here: " + stack[stack.length - 1] + " " + t + " " + b + ", not " + b + " " + t + " " + stack[stack.length - 1] : ""}.
      const a = stack.pop()!; // @ask a
      // @why Apply the operator and push the result, so it can be an operand for a later operator.
      // @yes {a} + {b} = {a + b}. Push it: the sum is now one value that a later operator can use.
      // @no Not addition.
      if (t === "+") stack.push(a + b); // @moment {a} {t} {b}
      // @yes {a} − {b} = {a - b}. Push it as a single value.
      // @no Not subtraction.
      else if (t === "-") stack.push(a - b);
      // @yes {a} × {b} = {a * b}. Push it as a single value.
      // @no It must be division.
      else if (t === "*") stack.push(a * b);
      // @why Division must cut toward zero, which `Math.trunc` does (plain `/` gives decimals).
      // @say {a} ÷ {b} = {a / b}, cut toward zero to {Math.trunc(a / b)}. Push it as a single value.
      else stack.push(Math.trunc(a / b));
    } else {
      // @why A number is not used yet, so convert it and push it.
      // @say Push {t}.
      // @then Values waiting: {JSON.stringify(stack)}.
      stack.push(Number(t));
    }
  }
  // @why The single value left is the answer; `+ 0` turns -0 into 0.
  // @phase Answer
  // @returns {stack[0] + 0}: every operator folded its two operands into one value, so the whole expression has collapsed to this single number.
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
