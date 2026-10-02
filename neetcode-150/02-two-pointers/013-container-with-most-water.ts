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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function maxArea(height: number[]): number {
  let l = 0;
  let r = height.length - 1;
  let best = 0;
  while (l < r) {
    best = Math.max(best, (r - l) * Math.min(height[l], height[r]));
    if (height[l] < height[r]) l++;
    else r--;
  }
  return best;
}

test("11. Container With Most Water", () => {
  assert.equal(maxArea([1, 8, 6, 2, 5, 4, 8, 3, 7]), 49);
  assert.equal(maxArea([1, 1]), 1);
  assert.equal(maxArea([0, 0, 0]), 0);
  assert.equal(maxArea([1, 2, 4, 3]), 4);
});
