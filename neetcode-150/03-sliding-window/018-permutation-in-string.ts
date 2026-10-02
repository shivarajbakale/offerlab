/**
 * 567. Permutation in String
 * Difficulty: Medium
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/permutation-in-string/
 *
 * Given two strings `s1` and `s2`, return true if `s2` contains a permutation
 * of `s1` as a contiguous substring, otherwise false.
 *
 * Example 1:
 *   Input: s1 = "ab", s2 = "eidbaooo"
 *   Output: true   ("ba")
 *
 * Example 2:
 *   Input: s1 = "ab", s2 = "eidboaoo"
 *   Output: false
 *
 * Constraints:
 *   1 <= s1.length, s2.length <= 10^4
 *   s1 and s2 consist of lowercase English letters.
 *
 * Approach: Fixed-size window with match count
 *   Keep letter counts for s1 and for the current window of s2 (same length).
 *   Track how many of the 26 letters have equal counts. Sliding the window
 *   changes two counts, so update `matches` in O(1); 26 matches means found.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: sliding-window
 * Key insight: A permutation of s1 is any window of the same length with the same letter
 *   counts. Sliding changes only two counts, so a running count of matching letters makes
 *   each step O(1).
 * Real world: Malware scanners spotting a known byte multiset in a stream regardless of
 *   order, using a fixed-size rolling window of counts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function checkInclusion(s1: string, s2: string): boolean {
  if (s1.length > s2.length) return false;
  const a = "a".charCodeAt(0);
  const need = new Array<number>(26).fill(0);
  const have = new Array<number>(26).fill(0);
  for (let i = 0; i < s1.length; i++) {
    need[s1.charCodeAt(i) - a]++;
    have[s2.charCodeAt(i) - a]++;
  }

  let matches = 0;
  for (let i = 0; i < 26; i++) if (need[i] === have[i]) matches++;

  // Adjust `have[idx]` by delta and keep `matches` in sync.
  const bump = (idx: number, delta: number) => {
    if (have[idx] === need[idx]) matches--;
    have[idx] += delta;
    if (have[idx] === need[idx]) matches++;
  };

  for (let r = s1.length; r < s2.length; r++) {
    if (matches === 26) return true;
    bump(s2.charCodeAt(r) - a, 1);
    bump(s2.charCodeAt(r - s1.length) - a, -1);
  }
  return matches === 26;
}

test("567. Permutation in String", () => {
  assert.equal(checkInclusion("ab", "eidbaooo"), true);
  assert.equal(checkInclusion("ab", "eidboaoo"), false);
  assert.equal(checkInclusion("abc", "ab"), false);
  assert.equal(checkInclusion("adc", "dcda"), true);
});
