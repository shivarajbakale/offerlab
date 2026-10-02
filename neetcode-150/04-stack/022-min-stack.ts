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
 *
 * Approach: Parallel min stack
 *   Alongside the main stack, keep a stack where each entry is the minimum
 *   of all values at or below that position. Push/pop both together.
 *
 * Time: O(1) per operation   Space: O(n)
 *
 * Pattern: design,stack
 * Key insight: The minimum only changes when values are pushed or popped, so storing the
 *   min at every stack level lets pop restore the previous min instantly instead of
 *   rescanning.
 * Real world: An undo stack in an editor that also shows the smallest font size used so
 *   far, restoring it correctly as actions are undone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class MinStack {
  private stack: number[] = [];
  private mins: number[] = [];

  push(val: number): void {
    this.stack.push(val);
    const curMin = this.mins.length ? this.mins[this.mins.length - 1] : val;
    this.mins.push(Math.min(val, curMin));
  }

  pop(): void {
    this.stack.pop();
    this.mins.pop();
  }

  top(): number {
    return this.stack[this.stack.length - 1];
  }

  getMin(): number {
    return this.mins[this.mins.length - 1];
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
