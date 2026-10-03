/**
 * 84. Largest Rectangle in Histogram
 * Difficulty: Hard
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/largest-rectangle-in-histogram/
 *
 * Given an array `heights` of bar heights in a histogram where every bar has
 * width 1, return the area of the largest rectangle that fits inside the
 * histogram.
 *
 * Example 1:
 *   Input: heights = [2, 1, 5, 6, 2, 3]
 *   Output: 10   (bars 5 and 6, height 5, width 2)
 *
 * Example 2:
 *   Input: heights = [2, 4]
 *   Output: 4
 *
 * Constraints:
 *   1 <= heights.length <= 10^5
 *   0 <= heights[i] <= 10^4
 *
 * Approach: Monotonic increasing stack of [startIndex, height]
 *   When a shorter bar arrives, every taller bar on the stack can no longer
 *   extend right; pop it and compute its area up to the current index. The
 *   new bar can extend left to the start of the last popped bar. Bars left on
 *   the stack at the end extend all the way to the right edge.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: monotonic-stack
 * Key insight: A bar's rectangle ends at the first shorter bar to its right, and when a
 *   bar is popped its start can be inherited by the shorter bar, so each bar's maximal
 *   width is known when it leaves the stack.
 * Real world: Finding the largest free rectangular block in a memory or disk-allocation
 *   bitmap, row by row.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Finds the biggest rectangle that fits inside the bars.
export function largestRectangleArea(heights: number[]): number {
  // @why Bars with rising heights; each keeps how far left its rectangle can stretch.
  const stack: [number, number][] = []; // [start index, height]
  // @why Largest area seen so far.
  let best = 0;

  // @why Look at each bar as a new right edge.
  for (let i = 0; i < heights.length; i++) {
    // @why By default this bar's rectangle begins at its own position.
    let start = i;
    // @why Taller bars on the stack cannot extend past this shorter bar, so their rectangles end here.
    while (stack.length && stack[stack.length - 1][1] > heights[i]) {
      // @why Take the taller bar off the stack and look at its start and height.
      const [idx, h] = stack.pop()!;
      // @why Its rectangle spans from `idx` up to this bar, so area is height times width.
      best = Math.max(best, h * (i - idx));
      // @why The new shorter bar can stretch back left to where the taller one began.
      start = idx;
    }
    // @why Save this bar with the earliest start it can reach.
    stack.push([start, heights[i]]);
  }

  // @why Bars still on the stack reach all the way to the right end.
  for (const [idx, h] of stack) {
    // @why Their width runs from `idx` to the end of the array.
    best = Math.max(best, h * (heights.length - idx));
  }
  // @why Return the biggest area found.
  return best;
}

test("84. Largest Rectangle in Histogram", () => {
  assert.equal(largestRectangleArea([2, 1, 5, 6, 2, 3]), 10);
  assert.equal(largestRectangleArea([2, 4]), 4);
  assert.equal(largestRectangleArea([0]), 0);
  assert.equal(largestRectangleArea([2, 2, 2, 2]), 8);
  assert.equal(largestRectangleArea([2, 1, 2]), 3);
});
