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

// @rule dp[i] is true when s from index i on splits fully into dictionary words
// @why Returns whether `s` can be split into words that all appear in `wordDict`.
// @goal can "{s}" be cut into pieces that are all words from {JSON.stringify(wordDict)}?
export function wordBreak(s: string, wordDict: string[]): boolean {
  // @why Length of `s`, used for the base case and loop.
  // @phase Setup: one yes/no per suffix
  // @say Trying every way to cut the string is exponential, and the same tail gets re-checked many times. But whether a tail can be split never depends on how you reached it, so answer it once per starting index: {s.length + 1} answers in total.
  const n = s.length;
  // @why `dp[i]` means the suffix of `s` starting at `i` can be fully split into dictionary words.
  const dp = new Array<boolean>(n + 1).fill(false);
  // @why The empty suffix needs no words, so it is splittable; this is the base case.
  // @say The empty tail after the last letter needs no words, so it counts as split. A word that ends exactly at the end of "{s}" leans on this.
  dp[n] = true;
  // @why Go from the end so `dp` for later positions is already known.
  // @phase Each suffix, from the shortest: does some word start it cleanly?
  // @yes Next tail: "{s.slice(i)}" (from index {i}). Every shorter tail already has its answer.
  // @no Every tail is decided, including the whole string at index 0.
  for (let i = n - 1; i >= 0; i--) {
    // @why Try each word as the first word of the suffix at `i`.
    // @say Could "{w}" be the first word of "{s.slice(i)}"?
    for (const w of wordDict) {
      // @why The word `w` works here if it sits at `i` and what remains after it is splittable.
      // @say {s.startsWith(w, i) ? "\"" + w + "\" is at the front of the tail. " + (i + w.length === n ? "Nothing is left after it, and the empty tail counts as split." : "What's left, \"" + s.slice(i + w.length) + "\", was already answered: " + (dp[i + w.length] ? "it splits." : "it can't be split.")) : "\"" + s.slice(i) + "\" doesn't start with \"" + w + "\", so this word can't be the first piece."}
      const fits = s.startsWith(w, i) && dp[i + w.length]; // @ask fits
      // @why This word fits at `i`, and what remains after it must be splittable.
      // @yes "{w}" starts the tail, and {i + w.length === n ? "it ends exactly at the end of the string" : "the rest from index " + (i + w.length) + " was already shown splittable"}. So "{s.slice(i)}" splits.
      // @no {s.startsWith(w, i) ? "\"" + w + "\" starts the tail, but what's left after it can't be split, so this cut leads nowhere." : "Not a match."} {w === wordDict[wordDict.length - 1] ? "That was the last word, so \"" + s.slice(i) + "\" can't be split." : "Try the next word."}
      if (fits) {
        // @why One working word is enough, so suffix `i` is splittable.
        dp[i] = true; // @moment {JSON.stringify(s.slice(i))} splits
        // @why No need to try more words once one works.
        // @say One way to split is enough: the question is yes/no, not how many ways.
        break;
      }
    }
  }
  // @why `dp[0]` covers the whole string.
  // @phase Answer
  // @returns {dp[0]}: the tail starting at index 0 is the whole string. Each start index tried each word once, O(n × words × word length).
  return dp[0];
}

test("139. Word Break", () => {
  assert.equal(wordBreak("leetcode", ["leet", "code"]), true);
  assert.equal(wordBreak("applepenapple", ["apple", "pen"]), true);
  assert.equal(wordBreak("catsandog", ["cats", "dog", "sand", "and", "cat"]), false);
  assert.equal(wordBreak("a", ["b"]), false);
});
