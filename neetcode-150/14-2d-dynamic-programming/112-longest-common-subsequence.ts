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
 *
 * Pattern: dp-two-strings
 * Key insight: If the first characters match, they can always be paired, giving 1 + the
 *   rest. Otherwise one of them is unused, so skip one from either string and take the
 *   better. Each pair of suffixes is solved once in an (m+1) x (n+1) table.
 * Real world: The diff utility and git aligning two versions of a file by their longest
 *   common subsequence of lines to show what was added or removed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[i][j] is the LCS length of the suffixes text1[i..] and text2[j..]
// @why Returns the length of the longest sequence that appears in order in both strings.
export function longestCommonSubsequence(text1: string, text2: string): number {
  // @why Length of `text1`.
  const m = text1.length;
  // @why Length of `text2`.
  const n = text2.length;
  // @why `dp[i][j]` means the LCS of `text1[i..]` and `text2[j..]`; the extra row and column of 0s are empty suffixes.
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  // @why Go from the end of `text1` so the rows after `i` are done.
  for (let i = m - 1; i >= 0; i--) { // @say dp[i][j] = LCS of the suffixes text1[i..] and text2[j..]
    // @why Go from the end of `text2` so the cells after `j` are done.
    for (let j = n - 1; j >= 0; j--) { // @say Fill from the end so dp[i+1] and dp[j+1] are ready
      // @why If the letters match, count them and move both forward; otherwise drop one letter from either string and take the better.
      dp[i][j] = text1[i] === text2[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]); // @ask dp[i][j] // @say {text1[i]} vs {text2[j]}: match extends diagonal, else best of skip one
    }
  }
  // @why `dp[0][0]` covers both whole strings.
  return dp[0][0];
}

test("1143. Longest Common Subsequence", () => {
  assert.equal(longestCommonSubsequence("abcde", "ace"), 3);
  assert.equal(longestCommonSubsequence("abc", "abc"), 3);
  assert.equal(longestCommonSubsequence("abc", "def"), 0);
  assert.equal(longestCommonSubsequence("a", "a"), 1);
  assert.equal(longestCommonSubsequence("bsbininm", "jmjkbkjkv"), 1);
});
