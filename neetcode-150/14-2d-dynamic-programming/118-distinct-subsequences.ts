/**
 * 115. Distinct Subsequences
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/distinct-subsequences/
 *
 * Given strings `s` and `t`, return how many distinct subsequences of `s`
 * are equal to `t` (i.e. how many ways to delete characters from `s` so
 * that what remains is exactly `t`).
 *
 * Example 1:
 *   Input: s = "rabbbit", t = "rabbit"
 *   Output: 3
 *
 * Example 2:
 *   Input: s = "babgbag", t = "bag"
 *   Output: 5
 *
 * Constraints:
 *   1 <= s.length, t.length <= 1000
 *   s and t consist of English letters.
 *   The answer fits in a 32-bit signed integer.
 *
 * Approach: Bottom-up 2-D DP
 *   State: dp[i][j] = number of ways s[i..] can form t[j..].
 *   Recurrence:
 *     dp[i][j] = dp[i + 1][j]                       (skip s[i])
 *              + (s[i] === t[j] ? dp[i + 1][j + 1] : 0)  (match s[i] to t[j])
 *   Base: dp[i][n] = 1 (empty t is always formable), dp[m][j < n] = 0.
 *   Answer: dp[0][0].
 *
 * Time: O(m * n)   Space: O(m * n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function numDistinct(s: string, t: string): number {
  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][n] = 1;

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = dp[i + 1][j];
      if (s[i] === t[j]) dp[i][j] += dp[i + 1][j + 1];
    }
  }
  return dp[0][0];
}

test("115. Distinct Subsequences", () => {
  assert.equal(numDistinct("rabbbit", "rabbit"), 3);
  assert.equal(numDistinct("babgbag", "bag"), 5);
  assert.equal(numDistinct("a", "b"), 0);
  assert.equal(numDistinct("abc", "abcd"), 0);
});
