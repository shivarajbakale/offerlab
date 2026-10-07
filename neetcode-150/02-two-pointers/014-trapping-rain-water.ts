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

// @rule the water over every bar outside l..r is already counted
// @why Return how much rain water the bars can hold.
// @goal how much rain water can the bars {JSON.stringify(height)} trap?
export function trap(height: number[]): number {
  // @why `l` walks in from the left.
  // @phase Setup: one pointer and one running max from each side
  // @say Water over a bar is min(tallest to its left, tallest to its right) minus the bar. Precomputing both maxima for every bar takes two extra arrays. Instead walk in from both ends: whichever side is lower already knows its limiting wall.
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
  // @phase Settle the lower side, one bar at a time
  // @yes Bars {l}..{r} are still unsettled. Compare the two ends to see which side's water is already decided.
  // @no The pointers met at {l}. That last bar is the tallest seen, so it holds no water, and every other bar has been counted.
  while (l < r) {
    // @why The left side is lower, so the left max alone decides its water; the right has a taller wall.
    // @yes Left bar {height[l]} is lower than right bar {height[r]}. So there is a wall of at least {height[r]} on the right, and the water at {l} is capped only by the left max. Settle the left bar.
    // @no Right bar {height[r]} is {height[l] === height[r] ? "as high as" : "lower than"} left bar {height[l]}. So the left side has a wall at least as tall, and the water at {r} is capped only by the right max. Settle the right bar.
    if (height[l] < height[r]) {
      // @why Update the tallest wall on the left.
      // @say Tallest from the left so far: max({leftMax}, {height[l]}) = {Math.max(leftMax, height[l])}.
      leftMax = Math.max(leftMax, height[l]);
      // @why Water above this bar is the wall height minus the bar.
      // @say Water at {l}: left max {leftMax} − bar {height[l]} = {leftMax - height[l]}{leftMax - height[l] === 0 ? " (this bar is the new left wall, so nothing sits on it)" : ""}.
      // @then Total so far: {water}.
      water += leftMax - height[l]; // @ask water
      // @why This bar is done, so step right.
      // @then Every bar outside {l}..{r} is settled.
      l++;
    // @why The right side is lower or equal, so the right max decides its water.
    } else {
      // @why Update the tallest wall on the right.
      // @say Tallest from the right so far: max({rightMax}, {height[r]}) = {Math.max(rightMax, height[r])}.
      rightMax = Math.max(rightMax, height[r]);
      // @why Water above this bar is the wall height minus the bar.
      // @say Water at {r}: right max {rightMax} − bar {height[r]} = {rightMax - height[r]}{rightMax - height[r] === 0 ? " (this bar is the new right wall, so nothing sits on it)" : ""}.
      // @then Total so far: {water}.
      water += rightMax - height[r]; // @ask water
      // @why This bar is done, so step left.
      // @then Every bar outside {l}..{r} is settled.
      r--;
    }
  }
  // @why Total trapped water.
  // @phase Answer
  // @returns {water}: every bar was settled exactly once, in O(n) time and O(1) space.
  return water;
}

test("42. Trapping Rain Water", () => {
  assert.equal(trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]), 6);
  assert.equal(trap([4, 2, 0, 3, 2, 5]), 9);
  assert.equal(trap([5]), 0);
  assert.equal(trap([1, 2, 3, 4]), 0);
});
