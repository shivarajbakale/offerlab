/**
 * 139. Word Break
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/word-break/
 *
 * Given a string `s` and a dictionary `wordDict`, return true if `s` can be
 * split into a sequence of one or more dictionary words. Words may be reused
 * any number of times.
 *
 * Example 1:
 *   Input: s = "leetcode", wordDict = ["leet", "code"]
 *   Output: true
 *
 * Example 2:
 *   Input: s = "applepenapple", wordDict = ["apple", "pen"]
 *   Output: true
 *
 * Example 3:
 *   Input: s = "catsandog", wordDict = ["cats", "dog", "sand", "and", "cat"]
 *   Output: false
 *
 * Constraints:
 *   1 <= s.length <= 300
 *   1 <= wordDict.length <= 1000
 *   1 <= wordDict[i].length <= 20
 *   All strings are lowercase English letters; dictionary words are unique.
 *
 * Approach: Bottom-up DP, right to left
 *   State: dp[i] = true if the suffix s[i..] can be segmented.
 *   Recurrence: dp[n] = true;
 *     dp[i] = OR over words w where s starts with w at i of dp[i + w.length].
 *
 * Time: O(n * m * k)  (n = |s|, m = words, k = max word length)
 * Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function wordBreak(s: string, wordDict: string[]): boolean {
  const n = s.length;
  const dp = new Array<boolean>(n + 1).fill(false);
  dp[n] = true;
  for (let i = n - 1; i >= 0; i--) {
    for (const w of wordDict) {
      if (s.startsWith(w, i) && dp[i + w.length]) {
        dp[i] = true;
        break;
      }
    }
  }
  return dp[0];
}

test("139. Word Break", () => {
  assert.equal(wordBreak("leetcode", ["leet", "code"]), true);
  assert.equal(wordBreak("applepenapple", ["apple", "pen"]), true);
  assert.equal(wordBreak("catsandog", ["cats", "dog", "sand", "and", "cat"]), false);
  assert.equal(wordBreak("a", ["b"]), false);
});
