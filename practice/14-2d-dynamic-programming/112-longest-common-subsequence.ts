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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function longestCommonSubsequence(text1: string, text2: string): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("1143. Longest Common Subsequence", () => {
  assert.equal(longestCommonSubsequence("abcde", "ace"), 3);
  assert.equal(longestCommonSubsequence("abc", "abc"), 3);
  assert.equal(longestCommonSubsequence("abc", "def"), 0);
  assert.equal(longestCommonSubsequence("a", "a"), 1);
  assert.equal(longestCommonSubsequence("bsbininm", "jmjkbkjkv"), 1);
});
