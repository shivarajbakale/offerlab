/**
 * 11. Container With Most Water
 * Difficulty: Medium
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/container-with-most-water/
 *
 * You are given an array `height` of n vertical lines, where line i spans
 * from (i, 0) to (i, height[i]). Pick two lines that, together with the
 * x-axis, form a container holding the most water. Return that maximum
 * amount. The container cannot be slanted.
 *
 * Example 1:
 *   Input: height = [1, 8, 6, 2, 5, 4, 8, 3, 7]
 *   Output: 49
 *
 * Example 2:
 *   Input: height = [1, 1]
 *   Output: 1
 *
 * Constraints:
 *   2 <= n <= 10^5
 *   0 <= height[i] <= 10^4
 *
 * Approach: Two pointers, move the shorter side
 *   Start with the widest container. Area is limited by the shorter line, so
 *   moving the taller line inward can never help; always move the shorter one.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: two-pointers
 * Key insight: The area is capped by the shorter wall, and every narrower container using
 *   that wall is worse, so the shorter wall can be dropped without missing the optimum.
 * Real world: Choosing two support posts for the widest, tallest banner span, where
 *   moving the limiting post is the only way to improve.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Return the most water any two walls can hold.
export function maxArea(height: number[]): number {
  // @why `l` is the left wall, starting at the far left.
  let l = 0;
  // @why `r` is the right wall, starting at the far right (widest container).
  let r = height.length - 1;
  // @why Biggest area found so far.
  let best = 0;
  // @why Squeeze inward until the walls meet.
  while (l < r) {
    // @why Area is width times the shorter wall; keep the biggest.
    best = Math.max(best, (r - l) * Math.min(height[l], height[r])); // @say Width {r - l} times the shorter wall {Math.min(height[l], height[r])}
    // @why The shorter wall limits the water, and moving the taller one can't help, so move the shorter.
    if (height[l] < height[r]) l++; // @say The shorter wall caps the area; only moving it inward can help
    // @why Right wall is the shorter (or tied), so move it inward.
    else r--; // @say Right wall is the limit (or a tie), so move r inward
  }
  // @why The largest area seen.
  return best;
}

test("11. Container With Most Water", () => {
  assert.equal(maxArea([1, 8, 6, 2, 5, 4, 8, 3, 7]), 49);
  assert.equal(maxArea([1, 1]), 1);
  assert.equal(maxArea([0, 0, 0]), 0);
  assert.equal(maxArea([1, 2, 4, 3]), 4);
});
