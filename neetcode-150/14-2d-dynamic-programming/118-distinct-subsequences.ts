/**
 * 115. Distinct Subsequences
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/distinct-subsequences/
 *
 * Given strings `s` and `t`, return how many distinct subsequences of `s`
 * are equal to `t` (i.e. how many ways to delete characters from `s` so
 * that what remains is exactly `t`).
 *
 * Example 1:
 *   Input: s = "rabbbit", t = "rabbit"
 *   Output: 3
 *
 * Example 2:
 *   Input: s = "babgbag", t = "bag"
 *   Output: 5
 *
 * Constraints:
 *   1 <= s.length, t.length <= 1000
 *   s and t consist of English letters.
 *   The answer fits in a 32-bit signed integer.
 *
 * Approach: Bottom-up 2-D DP
 *   State: dp[i][j] = number of ways s[i..] can form t[j..].
 *   Recurrence:
 *     dp[i][j] = dp[i + 1][j]                       (skip s[i])
 *              + (s[i] === t[j] ? dp[i + 1][j + 1] : 0)  (match s[i] to t[j])
 *   Base: dp[i][n] = 1 (empty t is always formable), dp[m][j < n] = 0.
 *   Answer: dp[0][0].
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: dp-two-strings
 * Key insight: At s[i] you either skip it or, if it equals t[j], use it to match t[j]; the
 *   two choices never overlap, so their counts simply add. Empty t is matched in exactly
 *   one way, which seeds every count.
 * Real world: A bioinformatics tool counting how many ways a short motif occurs as a
 *   gapped subsequence in a DNA read, a measure of how strongly the motif is supported.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[i][j] is the number of ways to pick t[j..] in order from the suffix s[i..]
// @why Returns how many different ways `t` can be picked, in order, from `s`.
export function numDistinct(s: string, t: string): number {
  // @why Length of `s`.
  const m = s.length;
  // @why Length of `t`.
  const n = t.length;
  // @why `dp[i][j]` means the ways to form `t[j..]` from the suffix `s[i..]`.
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  // @why Forming an empty `t` can be done one way (pick nothing), for any suffix of `s`.
  for (let i = 0; i <= m; i++) dp[i][n] = 1;

  // @why Fill from the end so later cells are ready.
  for (let i = m - 1; i >= 0; i--) {
    // @why Fill from the end of `t` too.
    for (let j = n - 1; j >= 0; j--) {
      // @why Skipping `s[i]` always works, so start with the ways from the next `s` position.
      dp[i][j] = dp[i + 1][j];
      // @why If letters match, we may also use `s[i]` for `t[j]`, adding the ways to match the rest.
      if (s[i] === t[j]) dp[i][j] += dp[i + 1][j + 1]; // @ask dp[i][j]
    }
  }
  // @why `dp[0][0]` is all of `s` and all of `t`.
  return dp[0][0];
}

test("115. Distinct Subsequences", () => {
  assert.equal(numDistinct("rabbbit", "rabbit"), 3);
  assert.equal(numDistinct("babgbag", "bag"), 5);
  assert.equal(numDistinct("a", "b"), 0);
  assert.equal(numDistinct("abc", "abcd"), 0);
});
