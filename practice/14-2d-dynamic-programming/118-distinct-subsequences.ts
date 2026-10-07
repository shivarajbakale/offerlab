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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function numDistinct(s: string, t: string): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("115. Distinct Subsequences", () => {
  assert.equal(numDistinct("rabbbit", "rabbit"), 3);
  assert.equal(numDistinct("babgbag", "bag"), 5);
  assert.equal(numDistinct("a", "b"), 0);
  assert.equal(numDistinct("abc", "abcd"), 0);
});
