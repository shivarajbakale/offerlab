/**
 * 10. Regular Expression Matching
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/regular-expression-matching/
 *
 * Implement regex matching for a string `s` and pattern `p` supporting:
 *   '.' matches any single character
 *   '*' matches zero or more of the element right before it
 * The match must cover the entire string, not just part of it.
 *
 * Example 1:
 *   Input: s = "aa", p = "a"
 *   Output: false
 *
 * Example 2:
 *   Input: s = "aa", p = "a*"
 *   Output: true
 *
 * Example 3:
 *   Input: s = "ab", p = ".*"
 *   Output: true
 *
 * Constraints:
 *   1 <= s.length <= 20
 *   1 <= p.length <= 20
 *   s has only lowercase letters; p has lowercase letters, '.' and '*'.
 *   Every '*' is preceded by a valid character.
 *
 * Approach: Bottom-up 2-D DP
 *   State: dp[i][j] = true if s[i..] matches p[j..].
 *   Let first = i < m && (p[j] === s[i] || p[j] === '.').
 *   Recurrence:
 *     if p[j + 1] === '*':
 *       dp[i][j] = dp[i][j + 2]                  (use x* zero times)
 *               || (first && dp[i + 1][j])       (consume one s char, keep x*)
 *     else:
 *       dp[i][j] = first && dp[i + 1][j + 1]
 *   Base: dp[m][n] = true. Fill i from m down to 0 (s may be exhausted while
 *   the pattern still has x* pieces), j from n - 1 down to 0.
 *
 * Time: O(m * n)   Space: O(m * n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function isMatch(s: string, p: string): boolean {
  const m = s.length;
  const n = p.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<boolean>(n + 1).fill(false));
  dp[m][n] = true;

  for (let i = m; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const first = i < m && (p[j] === s[i] || p[j] === ".");
      if (j + 1 < n && p[j + 1] === "*") {
        dp[i][j] = dp[i][j + 2] || (first && dp[i + 1][j]);
      } else {
        dp[i][j] = first && dp[i + 1][j + 1];
      }
    }
  }
  return dp[0][0];
}

test("10. Regular Expression Matching", () => {
  assert.equal(isMatch("aa", "a"), false);
  assert.equal(isMatch("aa", "a*"), true);
  assert.equal(isMatch("ab", ".*"), true);
  assert.equal(isMatch("aab", "c*a*b"), true);
  assert.equal(isMatch("mississippi", "mis*is*p*."), false);
});
