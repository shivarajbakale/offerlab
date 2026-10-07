/**
 * 424. Longest Repeating Character Replacement
 * Difficulty: Medium
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/longest-repeating-character-replacement/
 *
 * Given a string `s` of uppercase English letters and an integer `k`, you may
 * change at most `k` characters to any other uppercase letter. Return the
 * length of the longest substring containing a single repeated letter you can
 * obtain.
 *
 * Example 1:
 *   Input: s = "ABAB", k = 2
 *   Output: 4
 *
 * Example 2:
 *   Input: s = "AABABBA", k = 1
 *   Output: 4
 *
 * Constraints:
 *   1 <= s.length <= 10^5
 *   0 <= k <= s.length
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function characterReplacement(s: string, k: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("424. Longest Repeating Character Replacement", () => {
  assert.equal(characterReplacement("ABAB", 2), 4);
  assert.equal(characterReplacement("AABABBA", 1), 4);
  assert.equal(characterReplacement("A", 0), 1);
  assert.equal(characterReplacement("ABCD", 0), 1);
});
