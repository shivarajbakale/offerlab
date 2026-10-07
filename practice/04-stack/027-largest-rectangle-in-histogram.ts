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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function largestRectangleArea(heights: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("84. Largest Rectangle in Histogram", () => {
  assert.equal(largestRectangleArea([2, 1, 5, 6, 2, 3]), 10);
  assert.equal(largestRectangleArea([2, 4]), 4);
  assert.equal(largestRectangleArea([0]), 0);
  assert.equal(largestRectangleArea([2, 2, 2, 2]), 8);
  assert.equal(largestRectangleArea([2, 1, 2]), 3);
});
