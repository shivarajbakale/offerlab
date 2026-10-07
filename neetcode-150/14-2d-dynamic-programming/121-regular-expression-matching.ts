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
 *
 * Pattern: dp-two-strings
 * Key insight: A star pair x* is a choice: skip it entirely (j + 2) or, if the current
 *   char matches x, consume one character and stay on x* (i + 1, j). Filling i from m down
 *   lets an exhausted s still match trailing x* pieces.
 * Real world: A backtracking-free glob or regex matcher, as in a file-pattern filter or
 *   firewall rule engine, that guarantees O(m * n) time instead of exponential blowup.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[i][j] is true when the pattern p[j..] matches all of s[i..]
// @why Returns whether pattern `p` (with `.` and `*`) matches all of `s`.
// @goal does the pattern "{p}" match all of "{s}"?
export function isMatch(s: string, p: string): boolean {
  // @why Length of `s`.
  // @phase Setup: a table of (string suffix, pattern suffix) pairs
  // @say Trying every way to expand each x* backtracks and can blow up exponentially. But whether the rest matches depends only on where you are in s and where you are in p, so ({s.length} + 1) x ({p.length} + 1) answers are enough.
  const m = s.length;
  // @why Length of `p`.
  const n = p.length;
  // @why `dp[i][j]` means `s[i..]` is matched by `p[j..]`.
  const dp = Array.from({ length: m + 1 }, () => new Array<boolean>(n + 1).fill(false));
  // @why Empty string and empty pattern match.
  // @say Base case: an empty pattern matches an empty string. An empty pattern can't match anything else, so the rest of the last column stays false.
  dp[m][n] = true;

  // @why Include `i = m` since a pattern like `a*` can match an empty string.
  // @phase Fill from the back: plain letters must match, x* may skip or repeat
  // @yes Row {i}: {i < m ? "string suffix \"" + s.slice(i) + "\"" : "the empty string, which x* pieces can still match"}.
  // @no Every pair is solved.
  for (let i = m; i >= 0; i--) {
    // @why Fill from the end of the pattern so later cells are ready.
    // @yes Does pattern "{p.slice(j)}" match {i < m ? "\"" + s.slice(i) + "\"" : "the empty string"}?
    // @no Row {i} is done.
    for (let j = n - 1; j >= 0; j--) {
      // @why Does the current pattern character match the current letter? Needs a letter left, and `.` matches any.
      // @say {p[j] === "*" ? "A '*' on its own matches no letter." : i >= m ? "No letters left in s, so the pattern's " + p[j] + " can't consume one." : p[j] === "." ? "The pattern has '.', which matches " + s[i] + "." : p[j] === s[i] ? "Pattern " + p[j] + " matches letter " + s[i] + "." : "Pattern " + p[j] + " does not match letter " + s[i] + "."}
      const first = i < m && (p[j] === s[i] || p[j] === ".");
      // @why A `*` after this pattern letter means it can repeat zero or more times.
      // @yes "{p[j]}*" can stand for zero or more {p[j] === "." ? "letters" : p[j] + "'s"}, so there are two ways forward.
      // @no {p[j] === "*" ? "This is the * itself. It only means something with the letter before it, which handles it, so this cell is never read." : "No star after " + p[j] + ", so it must match exactly one letter."}
      if (j + 1 < n && p[j + 1] === "*") {
        // @why Either use zero copies (skip `x*`), or match one letter now and stay on the same `x*`.
        // @say Zero copies: skip "{p[j]}*", leaving {j + 2 < n ? "\"" + p.slice(j + 2) + "\"" : "an empty pattern"} to match: {dp[i][j + 2]}. {first ? "Or use one copy on " + s[i] + " and stay on " + p[j] + "* for more: " + dp[i + 1][j] + "." : "Using a copy isn't possible here."}
        dp[i][j] = dp[i][j + 2] || (first && dp[i + 1][j]); // @ask dp[i][j]
      } else {
        // @why No star: this letter must match, and the rest must match too.
        // @say {p[j] === "*" ? "Mark it false; nothing reads it." : first ? "Consume " + s[i] + " with " + p[j] + "; the answer is whether " + (j + 1 < n ? "\"" + p.slice(j + 1) + "\"" : "the empty pattern") + " matches " + (i + 1 < m ? "\"" + s.slice(i + 1) + "\"" : "the empty rest") + ": " + dp[i + 1][j + 1] + "." : "This letter can't be matched and there's no star to skip it, so false."}
        dp[i][j] = first && dp[i + 1][j + 1]; // @ask dp[i][j]
      }
    }
  }
  // @why `dp[0][0]` is the whole string against the whole pattern.
  // @phase Answer
  // @returns {dp[0][0]}: {dp[0][0] ? "\"" + p + "\" covers all of \"" + s + "\"." : "no expansion of \"" + p + "\" covers exactly \"" + s + "\"."}
  return dp[0][0];
}

test("10. Regular Expression Matching", () => {
  assert.equal(isMatch("aa", "a"), false);
  assert.equal(isMatch("aa", "a*"), true);
  assert.equal(isMatch("ab", ".*"), true);
  assert.equal(isMatch("aab", "c*a*b"), true);
  assert.equal(isMatch("mississippi", "mis*is*p*."), false);
});
