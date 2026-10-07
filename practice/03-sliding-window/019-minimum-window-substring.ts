/**
 * 76. Minimum Window Substring
 * Difficulty: Hard
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/minimum-window-substring/
 *
 * Given strings `s` and `t`, return the shortest substring of `s` that
 * contains every character of `t` (including duplicates). If none exists,
 * return "". The answer is guaranteed to be unique.
 *
 * Example 1:
 *   Input: s = "ADOBECODEBANC", t = "ABC"
 *   Output: "BANC"
 *
 * Example 2:
 *   Input: s = "a", t = "a"
 *   Output: "a"
 *
 * Example 3:
 *   Input: s = "a", t = "aa"
 *   Output: ""
 *
 * Constraints:
 *   1 <= s.length, t.length <= 10^5
 *   s and t consist of uppercase and lowercase English letters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function minWindow(s: string, t: string): string {
  // TODO: implement
  throw new Error("Not implemented");
}

test("76. Minimum Window Substring", () => {
  assert.equal(minWindow("ADOBECODEBANC", "ABC"), "BANC");
  assert.equal(minWindow("a", "a"), "a");
  assert.equal(minWindow("a", "aa"), "");
  assert.equal(minWindow("ab", "b"), "b");
  assert.equal(minWindow("aaflslflsldkalskaaa", "aaa"), "aaa");
});
