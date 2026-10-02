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
 *
 * Approach: Bottom-up 2-D DP
 *   State: dp[i][j] = min operations to turn word1[i..] into word2[j..].
 *   Recurrence:
 *     dp[i][j] = dp[i + 1][j + 1]                  if word1[i] === word2[j]
 *     dp[i][j] = 1 + min(dp[i + 1][j],             (delete word1[i])
 *                        dp[i][j + 1],             (insert word2[j])
 *                        dp[i + 1][j + 1])         (replace)
 *   Base: dp[m][j] = n - j (insert the rest), dp[i][n] = m - i (delete the
 *   rest). Answer: dp[0][0].
 *
 * Time: O(m * n)   Space: O(m * n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function minDistance(word1: string, word2: string): number {
  const m = word1.length;
  const n = word2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[m][j] = n - j;
  for (let i = 0; i <= m; i++) dp[i][n] = m - i;

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        word1[i] === word2[j]
          ? dp[i + 1][j + 1]
          : 1 + Math.min(dp[i + 1][j], dp[i][j + 1], dp[i + 1][j + 1]);
    }
  }
  return dp[0][0];
}

test("72. Edit Distance", () => {
  assert.equal(minDistance("horse", "ros"), 3);
  assert.equal(minDistance("intention", "execution"), 5);
  assert.equal(minDistance("", "abc"), 3);
  assert.equal(minDistance("abc", "abc"), 0);
});
