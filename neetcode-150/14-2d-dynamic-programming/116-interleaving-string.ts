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

// @rule dp[i][j] is true when s1[i..] and s2[j..] can be woven into s3[i+j..]
// @why Returns whether `s3` can be made by weaving `s1` and `s2`, keeping each one's order.
// @goal can "{s3}" be woven from "{s1}" and "{s2}", keeping each one's letters in order?
export function isInterleave(s1: string, s2: string, s3: string): boolean {
  // @why Length of `s1`.
  // @phase Setup: rule out impossible lengths, then a table of suffixes
  // @say Trying every way to weave is like choosing which {s3.length} positions come from s1: exponential. But once you've used i letters of s1 and j of s2, your position in s3 is fixed at i + j, so the pair (i, j) is the whole state.
  const m = s1.length;
  // @why Length of `s2`.
  const n = s2.length;
  // @why If the lengths don't add up, `s3` can't use every letter exactly once.
  // @yes {m} + {n} = {m + n}, but s3 has {s3.length} letters. Every letter must be used exactly once, so no weave can work.
  // @no {m} + {n} = {s3.length}: the letter counts line up, so it's worth checking the order.
  // @returns false: the lengths alone rule it out.
  if (m + n !== s3.length) return false;

  // @why `dp[i][j]` means `s1[i..]` and `s2[j..]` can be woven into `s3[i + j..]`.
  const dp = Array.from({ length: m + 1 }, () => new Array<boolean>(n + 1).fill(false));
  // @why Both suffixes empty gives the empty rest of `s3`, which matches.
  // @say Base case: with both strings used up, the rest of s3 is empty too, and an empty string is trivially woven from two empty ones.
  dp[m][n] = true;
  // @why Fill from the end so the cells after `i` are known.
  // @phase Fill from the back: can the rest of s3 be built from what's left?
  // @yes Row {i}: {i < m ? "s1 has \"" + s1.slice(i) + "\" left" : "s1 is used up"}. Everything with more of s1 used is already known.
  // @no Every (i, j) pair is solved.
  for (let i = m; i >= 0; i--) {
    // @why Fill from the end so the cells after `j` are known.
    // @yes Cell ({i}, {j}): {i < m ? "\"" + s1.slice(i) + "\"" : "nothing"} from s1 and {j < n ? "\"" + s2.slice(j) + "\"" : "nothing"} from s2 must make {i + j < s3.length ? "\"" + s3.slice(i + j) + "\"" : "the empty rest"}.
    // @no Row {i} is done.
    for (let j = n; j >= 0; j--) {
      // @why Take the next letter from `s1` if it matches `s3[i + j]` and the rest works.
      // @yes s1's {s1[i]} matches s3's next letter, and the rest after it can be woven, so taking it from s1 works.
      // @no {i >= m ? "s1 is used up, so the next letter can't come from it." : s1[i] !== s3[i + j] ? "s1 offers " + s1[i] + " but s3 needs " + s3[i + j] + ", so s1 can't supply it." : "s1's " + s1[i] + " matches, but what's left after taking it can't be woven."}
      if (i < m && s1[i] === s3[i + j] && dp[i + 1][j]) dp[i][j] = true;
      // @why Or take it from `s2` if it matches and the rest works; either path is enough.
      // @yes s2's {s2[j]} matches s3's next letter, and the rest after it can be woven, so taking it from s2 works.
      // @no {j >= n ? "s2 is used up" : s2[j] !== s3[i + j] ? "s2 offers " + s2[j] + " but s3 needs " + s3[i + j] : "s2's " + s2[j] + " matches, but the rest after it can't be woven"}. {i === m && j === n ? "This is the base case, already true." : dp[i][j] ? "Taking from s1 already works, so this cell is true." : "Neither choice works, so this cell stays false."}
      if (j < n && s2[j] === s3[i + j] && dp[i][j + 1]) dp[i][j] = true; // @ask dp[i][j]
    }
  }
  // @why `dp[0][0]` is the full strings.
  // @phase Answer
  // @returns {dp[0][0]}: {dp[0][0] ? "starting from the full strings, some order of picks rebuilds all of s3." : "no order of picks rebuilds s3 from the full strings."}
  return dp[0][0];
}

test("97. Interleaving String", () => {
  assert.equal(isInterleave("aabcc", "dbbca", "aadbbcbcac"), true);
  assert.equal(isInterleave("aabcc", "dbbca", "aadbbbaccc"), false);
  assert.equal(isInterleave("", "", ""), true);
  assert.equal(isInterleave("a", "", "a"), true);
  assert.equal(isInterleave("a", "b", "a"), false);
});
