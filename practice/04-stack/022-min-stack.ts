/**
 * 155. Min Stack
 * Difficulty: Medium
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/min-stack/
 *
 * Design a stack that supports push, pop, top, and retrieving the minimum
 * element, all in O(1) time:
 *   - push(val): push val onto the stack.
 *   - pop(): remove the top element.
 *   - top(): return the top element.
 *   - getMin(): return the minimum element in the stack.
 * pop, top and getMin are only called on non-empty stacks.
 *
 * Example 1:
 *   Input:  ["MinStack","push","push","push","getMin","pop","top","getMin"]
 *           [[],[-2],[0],[-3],[],[],[],[]]
 *   Output: [null,null,null,null,-3,null,0,-2]
 *
 * Constraints:
 *   -2^31 <= val <= 2^31 - 1
 *   At most 3 * 10^4 calls in total.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class MinStack {
  push(val: number): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  pop(): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  top(): number {
    // TODO: implement
    throw new Error("Not implemented");
  }

  getMin(): number {
    // TODO: implement
    throw new Error("Not implemented");
  }
}

test("155. Min Stack", () => {
  const s = new MinStack();
  s.push(-2);
  s.push(0);
  s.push(-3);
  assert.equal(s.getMin(), -3);
  s.pop();
  assert.equal(s.top(), 0);
  assert.equal(s.getMin(), -2);

  // Duplicate minimums.
  const d = new MinStack();
  d.push(1);
  d.push(1);
  d.pop();
  assert.equal(d.getMin(), 1);
});
