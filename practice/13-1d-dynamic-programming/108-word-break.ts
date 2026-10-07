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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function wordBreak(s: string, wordDict: string[]): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("139. Word Break", () => {
  assert.equal(wordBreak("leetcode", ["leet", "code"]), true);
  assert.equal(wordBreak("applepenapple", ["apple", "pen"]), true);
  assert.equal(wordBreak("catsandog", ["cats", "dog", "sand", "and", "cat"]), false);
  assert.equal(wordBreak("a", ["b"]), false);
});
