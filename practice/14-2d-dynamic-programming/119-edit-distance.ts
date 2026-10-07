/**
 * 72. Edit Distance
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/edit-distance/
 *
 * Given two strings `word1` and `word2`, return the minimum number of
 * single-character operations (insert, delete, replace) needed to turn
 * `word1` into `word2`.
 *
 * Example 1:
 *   Input: word1 = "horse", word2 = "ros"
 *   Output: 3   (horse -> rorse -> rose -> ros)
 *
 * Example 2:
 *   Input: word1 = "intention", word2 = "execution"
 *   Output: 5
 *
 * Constraints:
 *   0 <= word1.length, word2.length <= 500
 *   Both strings are lowercase English letters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function minDistance(word1: string, word2: string): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("72. Edit Distance", () => {
  assert.equal(minDistance("horse", "ros"), 3);
  assert.equal(minDistance("intention", "execution"), 5);
  assert.equal(minDistance("", "abc"), 3);
  assert.equal(minDistance("abc", "abc"), 0);
});
