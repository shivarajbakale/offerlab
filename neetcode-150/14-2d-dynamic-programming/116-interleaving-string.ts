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
 *
 * Approach: Bottom-up 2-D DP
 *   If lengths don't add up, return false.
 *   State: dp[i][j] = true if s3[i + j..] can be formed from s1[i..] and
 *   s2[j..].
 *   Recurrence:
 *     dp[i][j] = (s1[i] === s3[i + j] && dp[i + 1][j])
 *             || (s2[j] === s3[i + j] && dp[i][j + 1])
 *   Base: dp[m][n] = true. Answer: dp[0][0].
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: dp-two-strings
 * Key insight: Position i + j in s3 is fully determined by how many characters were taken
 *   from s1 (i) and s2 (j), so the state is just (i, j). Each cell asks: does the next s3
 *   char come from s1 or from s2, and is the rest still formable?
 * Real world: A log merger checking that a combined event stream is a valid interleaving
 *   of two services' logs, with each service's own event order preserved.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns whether `s3` can be made by weaving `s1` and `s2`, keeping each one's order.
export function isInterleave(s1: string, s2: string, s3: string): boolean {
  // @why Length of `s1`.
  const m = s1.length;
  // @why Length of `s2`.
  const n = s2.length;
  // @why If the lengths don't add up, `s3` can't use every letter exactly once.
  if (m + n !== s3.length) return false;

  // @why `dp[i][j]` means `s1[i..]` and `s2[j..]` can be woven into `s3[i + j..]`.
  const dp = Array.from({ length: m + 1 }, () => new Array<boolean>(n + 1).fill(false));
  // @why Both suffixes empty gives the empty rest of `s3`, which matches.
  dp[m][n] = true;
  // @why Fill from the end so the cells after `i` are known.
  for (let i = m; i >= 0; i--) {
    // @why Fill from the end so the cells after `j` are known.
    for (let j = n; j >= 0; j--) {
      // @why Take the next letter from `s1` if it matches `s3[i + j]` and the rest works.
      if (i < m && s1[i] === s3[i + j] && dp[i + 1][j]) dp[i][j] = true;
      // @why Or take it from `s2` if it matches and the rest works; either path is enough.
      if (j < n && s2[j] === s3[i + j] && dp[i][j + 1]) dp[i][j] = true;
    }
  }
  // @why `dp[0][0]` is the full strings.
  return dp[0][0];
}

test("97. Interleaving String", () => {
  assert.equal(isInterleave("aabcc", "dbbca", "aadbbcbcac"), true);
  assert.equal(isInterleave("aabcc", "dbbca", "aadbbbaccc"), false);
  assert.equal(isInterleave("", "", ""), true);
  assert.equal(isInterleave("a", "", "a"), true);
  assert.equal(isInterleave("a", "b", "a"), false);
});
