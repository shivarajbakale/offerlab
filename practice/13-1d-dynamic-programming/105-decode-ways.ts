/**
 * 91. Decode Ways
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/decode-ways/
 *
 * Letters are encoded as numbers: 'A' -> "1", 'B' -> "2", ..., 'Z' -> "26".
 * Given a string `s` of digits, return the number of ways to decode it back
 * into letters. Groupings with a leading zero (like "06") are invalid. If
 * no decoding exists, return 0.
 *
 * Example 1:
 *   Input: s = "12"
 *   Output: 2   ("AB" from 1 2, "L" from 12)
 *
 * Example 2:
 *   Input: s = "226"
 *   Output: 3   ("BZ", "VF", "BBF")
 *
 * Example 3:
 *   Input: s = "06"
 *   Output: 0
 *
 * Constraints:
 *   1 <= s.length <= 100
 *   s contains only digits and may contain leading zeros.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function numDecodings(s: string): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("91. Decode Ways", () => {
  assert.equal(numDecodings("12"), 2);
  assert.equal(numDecodings("226"), 3);
  assert.equal(numDecodings("06"), 0);
  assert.equal(numDecodings("10"), 1);
  assert.equal(numDecodings("2101"), 1);
});
