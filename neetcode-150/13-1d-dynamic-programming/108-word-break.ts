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
 *
 * Pattern: dp-1d
 * Key insight: Whether s[i..] can be segmented depends only on whether some word matches
 *   at i and the rest s[i + len..] is segmentable. Each suffix is solved once, so there
 *   is no exponential re-checking.
 * Real world: Splitting text written without spaces into words, such as hashtags, URLs or
 *   Chinese and Thai text, by checking dictionary words against the remaining suffix.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns whether `s` can be split into words that all appear in `wordDict`.
export function wordBreak(s: string, wordDict: string[]): boolean {
  // @why Length of `s`, used for the base case and loop.
  const n = s.length;
  // @why `dp[i]` means the suffix of `s` starting at `i` can be fully split into dictionary words.
  const dp = new Array<boolean>(n + 1).fill(false);
  // @why The empty suffix needs no words, so it is splittable; this is the base case.
  dp[n] = true;
  // @why Go from the end so `dp` for later positions is already known.
  for (let i = n - 1; i >= 0; i--) {
    // @why Try each word as the first word of the suffix at `i`.
    for (const w of wordDict) {
      // @why This word fits at `i`, and what remains after it must be splittable.
      if (s.startsWith(w, i) && dp[i + w.length]) {
        // @why One working word is enough, so suffix `i` is splittable.
        dp[i] = true;
        // @why No need to try more words once one works.
        break;
      }
    }
  }
  // @why `dp[0]` covers the whole string.
  return dp[0];
}

test("139. Word Break", () => {
  assert.equal(wordBreak("leetcode", ["leet", "code"]), true);
  assert.equal(wordBreak("applepenapple", ["apple", "pen"]), true);
  assert.equal(wordBreak("catsandog", ["cats", "dog", "sand", "and", "cat"]), false);
  assert.equal(wordBreak("a", ["b"]), false);
});
