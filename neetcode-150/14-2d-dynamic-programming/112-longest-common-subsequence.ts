/**
 * 1143. Longest Common Subsequence
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/longest-common-subsequence/
 *
 * Given two strings `text1` and `text2`, return the length of their longest
 * common subsequence: a sequence of characters appearing in both strings in
 * the same relative order (not necessarily contiguous). Return 0 if none.
 *
 * Example 1:
 *   Input: text1 = "abcde", text2 = "ace"
 *   Output: 3   ("ace")
 *
 * Example 2:
 *   Input: text1 = "abc", text2 = "abc"
 *   Output: 3
 *
 * Example 3:
 *   Input: text1 = "abc", text2 = "def"
 *   Output: 0
 *
 * Constraints:
 *   1 <= text1.length, text2.length <= 1000
 *   Both strings are lowercase English letters.
 *
 * Approach: Bottom-up 2-D DP
 *   State: dp[i][j] = LCS length of suffixes text1[i..] and text2[j..].
 *   Recurrence:
 *     dp[i][j] = 1 + dp[i + 1][j + 1]              if text1[i] === text2[j]
 *     dp[i][j] = max(dp[i + 1][j], dp[i][j + 1])   otherwise
 *   Base: dp[m][*] = dp[*][n] = 0. Answer: dp[0][0].
 *
 * Time: O(m * n)   Space: O(m * n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestCommonSubsequence(text1: string, text2: string): number {
  const m = text1.length;
  const n = text2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        text1[i] === text2[j]
          ? 1 + dp[i + 1][j + 1]
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp[0][0];
}

test("1143. Longest Common Subsequence", () => {
  assert.equal(longestCommonSubsequence("abcde", "ace"), 3);
  assert.equal(longestCommonSubsequence("abc", "abc"), 3);
  assert.equal(longestCommonSubsequence("abc", "def"), 0);
  assert.equal(longestCommonSubsequence("a", "a"), 1);
  assert.equal(longestCommonSubsequence("bsbininm", "jmjkbkjkv"), 1);
});
