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
 *
 * Approach: Bottom-up DP, right to left, O(1) space
 *   State: dp[i] = number of ways to decode the suffix s[i..].
 *   Recurrence:
 *     dp[n] = 1
 *     dp[i] = 0                         if s[i] === '0'
 *     dp[i] = dp[i + 1]                 (take one digit)
 *           + dp[i + 2]                 if s[i..i+1] is between 10 and 26
 *   Keep only dp[i + 1] and dp[i + 2].
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: dp-1d
 * Key insight: The ways to decode a suffix depend only on taking one digit or a valid
 *   two-digit code (10-26), and a leading "0" makes it 0 ways. So dp[i] needs only dp[i +
 *   1] and dp[i + 2].
 * Real world: Counting ambiguous parses when decoding a message format without
 *   separators, such as numeric SMS encodings or variable-length codes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns how many ways the digit string can be read as letters (1 to 26).
export function numDecodings(s: string): number {
  // @why `next1` means ways to decode the suffix starting at `i + 1`; the empty suffix has 1 way.
  let next1 = 1; // dp[i + 1]
  // @why `next2` means ways to decode the suffix starting at `i + 2`; starts at 0 as it doesn't exist yet.
  let next2 = 0; // dp[i + 2]
  // @why Go from the end so the answers for later suffixes are ready.
  for (let i = s.length - 1; i >= 0; i--) {
    // @why `cur` means ways to decode the suffix starting at `i`; 0 until we find a valid reading.
    let cur = 0;
    // @why A leading '0' can't be a letter on its own, so it adds no ways.
    if (s[i] !== "0") {
      // @why Read this digit as one letter; the rest can be decoded in `dp[i + 1]` ways.
      cur = next1;
      // @why Also read two digits as one letter if they make 10 to 26 (the '0' check above rules out 0x).
      if (i + 1 < s.length && Number(s.slice(i, i + 2)) <= 26) cur += next2;
    }
    // @why Slide the window: old `i + 1` becomes `i + 2`.
    next2 = next1;
    // @why The suffix at `i` becomes the new `i + 1`.
    next1 = cur;
  }
  // @why `next1` now holds the ways for the whole string, starting at index 0.
  return next1;
}

test("91. Decode Ways", () => {
  assert.equal(numDecodings("12"), 2);
  assert.equal(numDecodings("226"), 3);
  assert.equal(numDecodings("06"), 0);
  assert.equal(numDecodings("10"), 1);
  assert.equal(numDecodings("2101"), 1);
});
