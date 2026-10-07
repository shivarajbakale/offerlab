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

// @viz best:best
// @rule every container that uses a wall outside l..r has already been measured
// @why Return the most water any two walls can hold.
// @goal which two walls in {JSON.stringify(height)} hold the most water?
export function maxArea(height: number[]): number {
  // @why `l` is the left wall, starting at the far left.
  // @phase Setup: start with the widest container
  // @say Measuring every pair of walls is n² work. Start with the widest pair instead: any narrower container can only beat it with a taller short wall, and that tells you which wall to give up each step.
  let l = 0;
  // @why `r` is the right wall, starting at the far right (widest container).
  let r = height.length - 1;
  // @why Biggest area found so far.
  let best = 0;
  // @why Squeeze inward until the walls meet.
  // @phase Squeeze: measure, then give up the shorter wall
  // @yes Walls at {l} (height {height[l]}) and {r} (height {height[r]}) still form a container {r - l} wide.
  // @no The walls met. Every wall was dropped only once nothing better could use it, so the best container has been measured.
  while (l < r) {
    // @why Area is width times the shorter wall; keep the biggest.
    // @say Water rises only to the shorter wall: width {r - l} × height {Math.min(height[l], height[r])} = {(r - l) * Math.min(height[l], height[r])}. Best so far was {best}. {(r - l) * Math.min(height[l], height[r]) > best ? "New best." : "Not better, so best stays."}
    best = Math.max(best, (r - l) * Math.min(height[l], height[r]));
    // @why The shorter wall limits the water, and moving the taller one can't help, so move the shorter.
    // @yes The left wall ({height[l]}) is shorter. With it, every narrower container is capped at height {height[l]} and has less width, so none can beat this one. Drop it.
    // @no The right wall ({height[r]}) is {height[l] === height[r] ? "as short as the left" : "shorter"}. Every narrower container using it is capped at {height[r]} with less width, so drop it.
    if (height[l] < height[r]) l++; // @ask l
    // @why Right wall is the shorter (or tied), so move it inward.
    // @say Move r inward, past the wall at {r}.
    // @then Every container using a wall outside {l}..{r} has been measured or ruled out; best is {best}.
    else r--; // @ask r
  }
  // @why The largest area seen.
  // @phase Answer
  // @returns {best}: the largest container, found with each wall dropped once, in O(n).
  return best;
}

test("11. Container With Most Water", () => {
  assert.equal(maxArea([1, 8, 6, 2, 5, 4, 8, 3, 7]), 49);
  assert.equal(maxArea([1, 1]), 1);
  assert.equal(maxArea([0, 0, 0]), 0);
  assert.equal(maxArea([1, 2, 4, 3]), 4);
});
