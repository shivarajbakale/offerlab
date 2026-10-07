/**
 * 97. Interleaving String
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/interleaving-string/
 *
 * Given strings `s1`, `s2` and `s3`, return true if `s3` can be formed by
 * interleaving `s1` and `s2`: splitting each into pieces and merging the
 * pieces so that the characters of each string keep their original order.
 *
 * Example 1:
 *   Input: s1 = "aabcc", s2 = "dbbca", s3 = "aadbbcbcac"
 *   Output: true
 *
 * Example 2:
 *   Input: s1 = "aabcc", s2 = "dbbca", s3 = "aadbbbaccc"
 *   Output: false
 *
 * Example 3:
 *   Input: s1 = "", s2 = "", s3 = ""
 *   Output: true
 *
 * Constraints:
 *   0 <= s1.length, s2.length <= 100
 *   0 <= s3.length <= 200
 *   All strings are lowercase English letters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isInterleave(s1: string, s2: string, s3: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("97. Interleaving String", () => {
  assert.equal(isInterleave("aabcc", "dbbca", "aadbbcbcac"), true);
  assert.equal(isInterleave("aabcc", "dbbca", "aadbbbaccc"), false);
  assert.equal(isInterleave("", "", ""), true);
  assert.equal(isInterleave("a", "", "a"), true);
  assert.equal(isInterleave("a", "b", "a"), false);
});
