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
// @goal how long is the longest subsequence shared by "{text1}" and "{text2}"?
export function longestCommonSubsequence(text1: string, text2: string): number {
  // @why Length of `text1`.
  // @phase Setup: a table of suffix answers
  // @say Trying every subsequence of "{text1}" is 2^{text1.length} options. But the LCS of two suffixes depends only on the LCS of slightly shorter suffixes, so there are just ({text1.length} + 1) x ({text2.length} + 1) subproblems to solve once each.
  const m = text1.length;
  // @why Length of `text2`.
  const n = text2.length;
  // @why `dp[i][j]` means the LCS of `text1[i..]` and `text2[j..]`; the extra row and column of 0s are empty suffixes.
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  // @why Go from the end of `text1` so the rows after `i` are done.
  // @phase Fill the table from the back: shorter suffixes first
  // @yes Row {i}: suffix "{text1.slice(i)}". The row below it ({i + 1 === m ? "the empty suffix, all 0s" : "suffix \"" + text1.slice(i + 1) + "\""}) is complete, which every cell here may need.
  // @no Every pair of suffixes is solved; the top-left cell covers both whole strings.
  for (let i = m - 1; i >= 0; i--) {
    // @why Go from the end of `text2` so the cells after `j` are done.
    // @yes Compare "{text1.slice(i)}" with "{text2.slice(j)}". The cells to the right and below are already known.
    // @no Row {i} is done: dp[{i}][0] = {dp[i][0]} is the LCS of "{text1.slice(i)}" with all of "{text2}".
    for (let j = n - 1; j >= 0; j--) {
      // @why If the letters match, count them and move both forward; otherwise drop one letter from either string and take the better.
      // @say {text1[i] === text2[j] ? "Both start with " + text1[i] + ": pairing them never hurts, so take 1 + the LCS of what follows both, " + dp[i + 1][j + 1] + ", = " + (1 + dp[i + 1][j + 1]) + "." : text1[i] + " vs " + text2[j] + ": they can't pair with each other, so at least one is unused. Drop " + text1[i] + " (" + dp[i + 1][j] + ") or drop " + text2[j] + " (" + dp[i][j + 1] + "), keep the better: " + Math.max(dp[i + 1][j], dp[i][j + 1]) + "."}
      dp[i][j] = text1[i] === text2[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]); // @ask dp[i][j]
    }
  }
  // @why `dp[0][0]` covers both whole strings.
  // @phase Answer
  // @returns {dp[0][0]}: the LCS of the two whole strings, after filling {m * n} cells once each.
  return dp[0][0];
}

test("1143. Longest Common Subsequence", () => {
  assert.equal(longestCommonSubsequence("abcde", "ace"), 3);
  assert.equal(longestCommonSubsequence("abc", "abc"), 3);
  assert.equal(longestCommonSubsequence("abc", "def"), 0);
  assert.equal(longestCommonSubsequence("a", "a"), 1);
  assert.equal(longestCommonSubsequence("bsbininm", "jmjkbkjkv"), 1);
});
