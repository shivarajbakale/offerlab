/**
 * 62. Unique Paths
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/unique-paths/
 *
 * A robot starts at the top-left corner of an m x n grid and wants to reach
 * the bottom-right corner. It can only move right or down. Return the number
 * of distinct paths it can take.
 *
 * Example 1:
 *   Input: m = 3, n = 7
 *   Output: 28
 *
 * Example 2:
 *   Input: m = 3, n = 2
 *   Output: 3   (R-D-D, D-D-R, D-R-D)
 *
 * Constraints:
 *   1 <= m, n <= 100
 *   The answer is at most 2 * 10^9.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function uniquePaths(m: number, n: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("62. Unique Paths", () => {
  assert.equal(uniquePaths(3, 7), 28);
  assert.equal(uniquePaths(3, 2), 3);
  assert.equal(uniquePaths(1, 1), 1);
  assert.equal(uniquePaths(1, 10), 1);
});
