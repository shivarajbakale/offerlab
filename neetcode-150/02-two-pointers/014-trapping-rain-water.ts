/**
 * 42. Trapping Rain Water
 * Difficulty: Hard
 * Category: Two Pointers
 * LeetCode: https://leetcode.com/problems/trapping-rain-water/
 *
 * Given n non-negative integers describing an elevation map where each bar
 * has width 1, compute how much water is trapped after raining.
 *
 * Example 1:
 *   Input: height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]
 *   Output: 6
 *
 * Example 2:
 *   Input: height = [4, 2, 0, 3, 2, 5]
 *   Output: 9
 *
 * Constraints:
 *   1 <= n <= 2 * 10^4
 *   0 <= height[i] <= 10^5
 *
 * Approach: Two pointers with running maxima
 *   Water above bar i is min(maxLeft, maxRight) - height[i]. Keep pointers at
 *   both ends with the max seen from each side. Whichever side has the smaller
 *   max is the bottleneck, so we can settle that side's bar and move inward.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: two-pointers
 * Key insight: Water at a bar is min(maxLeft, maxRight) - height. When height[l] <
 *   height[r], the right side is guaranteed to have a wall at least that tall, so leftMax
 *   alone decides bar l and it can be settled now.
 * Real world: Estimating how much water pools on an uneven terrain profile in flood and
 *   drainage modeling.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Return how much rain water the bars can hold.
export function trap(height: number[]): number {
  // @why `l` walks in from the left.
  let l = 0;
  // @why `r` walks in from the right.
  let r = height.length - 1;
  // @why Tallest bar seen so far from the left.
  let leftMax = 0;
  // @why Tallest bar seen so far from the right.
  let rightMax = 0;
  // @why Total water collected.
  let water = 0;
  // @why Move inward until the two pointers meet.
  while (l < r) {
    // @why The left side is lower, so the left max alone decides its water; the right has a taller wall.
    if (height[l] < height[r]) {
      // @why Update the tallest wall on the left.
      leftMax = Math.max(leftMax, height[l]);
      // @why Water above this bar is the wall height minus the bar.
      water += leftMax - height[l];
      // @why This bar is done, so step right.
      l++;
    // @why The right side is lower or equal, so the right max decides its water.
    } else {
      // @why Update the tallest wall on the right.
      rightMax = Math.max(rightMax, height[r]);
      // @why Water above this bar is the wall height minus the bar.
      water += rightMax - height[r];
      // @why This bar is done, so step left.
      r--;
    }
  }
  // @why Total trapped water.
  return water;
}

test("42. Trapping Rain Water", () => {
  assert.equal(trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]), 6);
  assert.equal(trap([4, 2, 0, 3, 2, 5]), 9);
  assert.equal(trap([5]), 0);
  assert.equal(trap([1, 2, 3, 4]), 0);
});
