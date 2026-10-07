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

// @viz best:best
// @rule stack heights rise toward the top; each start is as far left as that bar can reach
// @why Finds the biggest rectangle that fits inside the bars.
// @goal what is the largest rectangle that fits under the bars {JSON.stringify(heights)}?
export function largestRectangleArea(heights: number[]): number {
  // @why Bars with rising heights; each keeps how far left its rectangle can stretch.
  // @phase Setup: a stack of bars whose rectangles are still growing
  // @say Trying every left and right edge is n² rectangles. But the best rectangle is as tall as its shortest bar, and that bar's rectangle stretches until a shorter bar blocks it on each side. A stack of rising heights finds both blocks in one pass.
  const stack: [number, number][] = []; // [start index, height]
  // @why Largest area seen so far.
  let best = 0;

  // @why Look at each bar as a new right edge.
  // @phase Each bar: close off the taller rectangles it blocks
  // @yes Bar {i} (height {heights[i]}) arrives as a possible right edge.
  // @no Every bar has arrived; the ones still on the stack were never blocked on the right.
  for (let i = 0; i < heights.length; i++) {
    // @why By default this bar's rectangle begins at its own position.
    // @say Bar {i}'s own rectangle starts at {i} unless taller bars to its left let it reach further back.
    let start = i;
    // @why Taller bars on the stack cannot extend past this shorter bar, so their rectangles end here.
    // @yes The bar on top has height {stack[stack.length - 1][1]}, taller than {heights[i]}. Its rectangle can't extend past bar {i}, so its width is now final: measure it.
    // @no {stack.length ? "The bar on top has height " + stack[stack.length - 1][1] + ", not taller than " + heights[i] + ", so its rectangle can keep growing right past bar " + i : "The stack is empty, so no rectangle is blocked"}.
    while (stack.length && stack[stack.length - 1][1] > heights[i]) { // @broken
      // @why Take the taller bar off the stack and look at its start and height.
      // @say Pop the height-{stack[stack.length - 1][1]} rectangle, which started at {stack[stack.length - 1][0]}.
      const [idx, h] = stack.pop()!; // @moment bar {stack[stack.length - 1][1]} ends at {i}
      // @why Its rectangle spans from `idx` up to this bar, so area is height times width.
      // @say It spans {idx}..{i - 1}: height {h} × width {i - idx} = {h * (i - idx)}. Best so far was {best}. {h * (i - idx) > best ? "New best." : "Not bigger, so best stays."}
      best = Math.max(best, h * (i - idx)); // @ask best
      // @why The new shorter bar can stretch back left to where the taller one began.
      // @say Every bar from {idx} up to {i} is at least {heights[i]} tall, so bar {i}'s rectangle can start back at {idx}.
      start = idx; // @ask start
    }
    // @why Save this bar with the earliest start it can reach.
    // @say Push height {heights[i]} starting at {start}. Its right edge is still open.
    // @then Open rectangles, bottom to top: {stack.map((e) => "height " + e[1] + " from " + e[0]).join(", ")}.
    stack.push([start, heights[i]]);
  }

  // @why Bars still on the stack reach all the way to the right end.
  // @phase Close the rectangles that reached the right end
  // @say Height {h} from {idx}: nothing shorter came after it, so it runs to the end.
  for (const [idx, h] of stack) {
    // @why Their width runs from `idx` to the end of the array.
    // @say Height {h} from {idx} to the end: {h} × {heights.length - idx} = {h * (heights.length - idx)}. Best so far was {best}. {h * (heights.length - idx) > best ? "New best." : "Not bigger, so best stays."}
    best = Math.max(best, h * (heights.length - idx));
  }
  // @why Return the biggest area found.
  // @phase Answer
  // @returns {best}: every bar's widest rectangle was measured once, so O(n).
  return best;
}

test("84. Largest Rectangle in Histogram", () => {
  assert.equal(largestRectangleArea([2, 1, 5, 6, 2, 3]), 10);
  assert.equal(largestRectangleArea([2, 4]), 4);
  assert.equal(largestRectangleArea([0]), 0);
  assert.equal(largestRectangleArea([2, 2, 2, 2]), 8);
  assert.equal(largestRectangleArea([2, 1, 2]), 3);
});
