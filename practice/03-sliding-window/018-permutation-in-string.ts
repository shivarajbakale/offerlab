/**
 * 567. Permutation in String
 * Difficulty: Medium
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/permutation-in-string/
 *
 * Given two strings `s1` and `s2`, return true if `s2` contains a permutation
 * of `s1` as a contiguous substring, otherwise false.
 *
 * Example 1:
 *   Input: s1 = "ab", s2 = "eidbaooo"
 *   Output: true   ("ba")
 *
 * Example 2:
 *   Input: s1 = "ab", s2 = "eidboaoo"
 *   Output: false
 *
 * Constraints:
 *   1 <= s1.length, s2.length <= 10^4
 *   s1 and s2 consist of lowercase English letters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function checkInclusion(s1: string, s2: string): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("567. Permutation in String", () => {
  assert.equal(checkInclusion("ab", "eidbaooo"), true);
  assert.equal(checkInclusion("ab", "eidboaoo"), false);
  assert.equal(checkInclusion("abc", "ab"), false);
  assert.equal(checkInclusion("adc", "dcda"), true);
});
