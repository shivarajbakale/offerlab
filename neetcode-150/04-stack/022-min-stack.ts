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

// @rule mins[k] is the smallest value in stack[0..k], so the top of mins is the current min
// @why A stack that can also report its smallest value in O(1).
export class MinStack {
  // @why The normal stack of values.
  // @phase Two stacks that grow and shrink together
  // @say Scanning the stack for its minimum costs O(n) per getMin. Instead, next to every value, remember the minimum of everything at or below it. Popping a value then reveals the minimum that held before it was pushed.
  private stack: number[] = [];
  // @why `mins[k]` is the smallest value among everything at or below position k of the stack.
  private mins: number[] = [];

  // @why Add a value to both stacks so they stay the same height.
  // @goal push {val}, and record what the minimum will be while {val} is on the stack
  push(val: number): void {
    // @why Store the value itself for `top()`.
    // @say {val} goes on top of the value stack.
    this.stack.push(val);
    // @why Find the minimum so far; the first value has nothing below it, so it is its own min.
    // @say {this.mins.length ? "The minimum of everything below is " + this.mins[this.mins.length - 1] + ", the top of mins." : "Nothing is below " + val + ", so it is its own minimum."}
    const curMin = this.mins.length ? this.mins[this.mins.length - 1] : val; // @ask curMin
    // @why Save the smaller of the new value and the old min at this level.
    // @say The minimum with {val} on top is min({val}, {curMin}) = {Math.min(val, curMin)}. {val < curMin ? val + " is the new minimum." : val === curMin ? "Equal, so the minimum stays " + val + "." : "The old minimum still holds."}
    // @then mins is {JSON.stringify(this.mins)}: entry k is the smallest of the bottom k + 1 values.
    this.mins.push(Math.min(val, curMin)); // @ask this.mins[this.mins.length-1] // @moment push {val}
  }

  // @why Remove from both stacks so they stay in step.
  // @goal remove the top value, {this.stack[this.stack.length - 1]}, and bring back the minimum from before it
  pop(): void {
    // @why Drop the value itself.
    // @say {this.stack[this.stack.length - 1]} leaves the value stack.
    this.stack.pop();
    // @why Dropping the matching min entry brings the previous minimum back for free.
    // @say Its mins entry, {this.mins[this.mins.length - 1]}, leaves too. The entry below was recorded before {this.mins.length > 1 ? "it was pushed, so it is exactly the minimum of what remains: " + this.mins[this.mins.length - 2] : "it was pushed, and nothing remains"}.
    // @returns nothing; both stacks shrank by one, so they stay in step.
    this.mins.pop(); // @moment pop; min back to {this.mins[this.mins.length - 2]}
  }

  // @why The newest value is at the end of the stack.
  // @goal what value is on top?
  top(): number {
    // @say The newest value is the last one pushed: {this.stack[this.stack.length - 1]}.
    // @returns {this.stack[this.stack.length - 1]}, without removing it.
    return this.stack[this.stack.length - 1];
  }

  // @why The top of `mins` is already the smallest value now in the stack, so no scanning needed.
  // @goal what is the smallest value on the stack right now?
  getMin(): number {
    // @say No scan needed: the top of mins, {this.mins[this.mins.length - 1]}, was computed as the minimum of the whole stack when its value was pushed.
    // @returns {this.mins[this.mins.length - 1]} in O(1).
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
