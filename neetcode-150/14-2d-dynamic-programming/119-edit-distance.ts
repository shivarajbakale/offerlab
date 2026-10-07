/**
 * 72. Edit Distance
 * Difficulty: Medium
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/edit-distance/
 *
 * Given two strings `word1` and `word2`, return the minimum number of
 * single-character operations (insert, delete, replace) needed to turn
 * `word1` into `word2`.
 *
 * Example 1:
 *   Input: word1 = "horse", word2 = "ros"
 *   Output: 3   (horse -> rorse -> rose -> ros)
 *
 * Example 2:
 *   Input: word1 = "intention", word2 = "execution"
 *   Output: 5
 *
 * Constraints:
 *   0 <= word1.length, word2.length <= 500
 *   Both strings are lowercase English letters.
 *
 * Approach: Bottom-up 2-D DP
 *   State: dp[i][j] = min operations to turn word1[i..] into word2[j..].
 *   Recurrence:
 *     dp[i][j] = dp[i + 1][j + 1]                  if word1[i] === word2[j]
 *     dp[i][j] = 1 + min(dp[i + 1][j],             (delete word1[i])
 *                        dp[i][j + 1],             (insert word2[j])
 *                        dp[i + 1][j + 1])         (replace)
 *   Base: dp[m][j] = n - j (insert the rest), dp[i][n] = m - i (delete the
 *   rest). Answer: dp[0][0].
 *
 * Time: O(m * n)   Space: O(m * n)
 *
 * Pattern: dp-two-strings
 * Key insight: When the current characters match, they cost nothing, so skip both.
 *   Otherwise one edit is spent and each of insert, delete and replace shrinks the problem
 *   to a neighbouring (i, j) cell; take the cheapest.
 * Real world: Spell checkers and fuzzy search rank suggestions by Levenshtein distance,
 *   and diff tools use the same table to align two versions of a file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[i][j] is the fewest edits that turn word1[i..] into word2[j..]
// @why Returns the fewest insert, delete or replace steps to turn `word1` into `word2`.
// @goal how many single-letter edits does it take to turn "{word1}" into "{word2}"?
export function minDistance(word1: string, word2: string): number {
  // @why Length of `word1`.
  // @phase Setup: a table of suffix pairs, with the easy edges filled in
  // @say Trying every sequence of edits is endless. But only the first letters matter: they match and cost nothing, or one edit removes a letter from one side or both. Either way you land on a pair of shorter suffixes, so ({word1.length} + 1) x ({word2.length} + 1) answers cover everything.
  const m = word1.length;
  // @why Length of `word2`.
  const n = word2.length;
  // @why `dp[i][j]` means the fewest edits to turn `word1[i..]` into `word2[j..]`.
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  // @why If `word1` has run out, we must insert all remaining `n - j` letters of `word2`.
  // @yes {j < n ? "word1 is used up but \"" + word2.slice(j) + "\" is left: the only way is to insert " + (n - j) + (n - j === 1 ? " letter." : " letters.") : "Both are used up: 0 edits."}
  // @no The bottom row is filled.
  for (let j = 0; j <= n; j++) dp[m][j] = n - j;
  // @why If `word2` has run out, we must delete all remaining `m - i` letters of `word1`.
  // @yes {i < m ? "word2 is used up but \"" + word1.slice(i) + "\" is left: the only way is to delete " + (m - i) + (m - i === 1 ? " letter." : " letters.") : "Both are used up: 0 edits."}
  // @no The right column is filled.
  for (let i = 0; i <= m; i++) dp[i][n] = m - i;

  // @why Fill from the end so the neighbours are ready.
  // @phase Fill from the back: free match, or the cheapest of three edits
  // @yes Row {i}: suffix "{word1.slice(i)}". The row below is done.
  // @no Every suffix pair is solved.
  for (let i = m - 1; i >= 0; i--) {
    // @why Fill from the end of `word2` too.
    // @yes Turn "{word1.slice(i)}" into "{word2.slice(j)}".
    // @no Row {i} is done.
    for (let j = n - 1; j >= 0; j--) {
      // @why If letters match, no edit is needed, so use the diagonal; otherwise pay 1 for the best of three edits.
      // @say {word1[i] === word2[j] ? "Both start with " + word1[i] + ": leave it alone at no cost; the rest takes " + dp[i + 1][j + 1] + (dp[i + 1][j + 1] === 1 ? " edit." : " edits.") : word1[i] + " vs " + word2[j] + ": one edit is unavoidable. Delete " + word1[i] + " (then " + dp[i + 1][j] + "), insert " + word2[j] + " (then " + dp[i][j + 1] + "), or replace " + word1[i] + " with " + word2[j] + " (then " + dp[i + 1][j + 1] + "). Cheapest: 1 + " + Math.min(dp[i + 1][j], dp[i][j + 1], dp[i + 1][j + 1]) + " = " + (1 + Math.min(dp[i + 1][j], dp[i][j + 1], dp[i + 1][j + 1])) + "."}
      dp[i][j] = word1[i] === word2[j] ? dp[i + 1][j + 1] : 1 + Math.min(dp[i + 1][j], dp[i][j + 1], dp[i + 1][j + 1]); // @ask dp[i][j]
    }
  }
  // @why `dp[0][0]` is the whole of both words.
  // @phase Answer
  // @returns {dp[0][0]}: the fewest edits from "{word1}" to "{word2}", each of the {(m + 1) * (n + 1)} cells solved once.
  return dp[0][0];
}

test("72. Edit Distance", () => {
  assert.equal(minDistance("horse", "ros"), 3);
  assert.equal(minDistance("intention", "execution"), 5);
  assert.equal(minDistance("", "abc"), 3);
  assert.equal(minDistance("abc", "abc"), 0);
});
