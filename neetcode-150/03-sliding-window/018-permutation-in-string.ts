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

// @rule matches counts the letters whose window count equals their count in s1
// @why Return true if some window of `s2` has the same letters as `s1`.
// @goal does "{s2}" contain a rearrangement of "{s1}" as one unbroken stretch?
export function checkInclusion(s1: string, s2: string): boolean {
  // @why `s1` is too long to fit inside `s2`.
  // @phase Setup: letter counts for s1 and the first window
  // @yes "{s1}" is longer than "{s2}", so no stretch of s2 can hold all its letters.
  // @no "{s1}" fits inside "{s2}", so there are windows to check.
  // @returns false: there is no window long enough.
  if (s1.length > s2.length) return false;
  // @why The code of 'a', so letters map to slots 0 to 25.
  // @say Generating every rearrangement of "{s1}" is factorial work. But a rearrangement is just "same letter counts", so slide a window of length {s1.length} over s2 and compare its 26 counts to s1's.
  const a = "a".charCodeAt(0);
  // @why Letter counts that `s1` requires.
  const need = new Array<number>(26).fill(0);
  // @why Letter counts of the current window in `s2`.
  const have = new Array<number>(26).fill(0);
  // @why Fill `need` from `s1` and `have` from the first window of `s2`.
  // @yes Count letter {i} of both: "{s1[i]}" from s1 and "{s2[i]}" from the first window of s2.
  // @no Both counts are filled: s1's letters, and the first window "{s2.slice(0, s1.length)}".
  for (let i = 0; i < s1.length; i++) {
    // @why Count this letter of `s1`.
    need[s1.charCodeAt(i) - a]++;
    // @why Count the matching spot in the first window.
    have[s2.charCodeAt(i) - a]++;
  }

  // @why How many of the 26 letters currently have equal counts.
  // @say Comparing all 26 counts after every slide would cost 26 per step. Count the matching letters once now, then keep that number up to date as single letters change.
  let matches = 0;
  // @why Check all letters once at the start to set `matches`.
  // @say {need[i] === have[i] ? "Equal, so \"" + String.fromCharCode(a + i) + "\" is a match: " + (matches + 1) + " so far." : "Not equal, so \"" + String.fromCharCode(a + i) + "\" is not a match yet."}
  // @yes Compare letter "{String.fromCharCode(a + i)}": s1 needs {need[i]}, the window has {have[i]}.
  // @no All 26 letters compared: {matches} of 26 have equal counts in "{s1}" and the first window.
  for (let i = 0; i < 26; i++) if (need[i] === have[i]) matches++;

  // Adjust `have[idx]` by delta and keep `matches` in sync.
  // @why Change one letter's count and fix `matches`, so we never recheck all 26.
  // @goal how does changing the count of "{String.fromCharCode(a + idx)}" by {delta} change the {matches} matching letters?
  const bump = (idx: number, delta: number) => {
    // @why It matched before the change, so it may stop matching.
    // @yes "{String.fromCharCode(a + idx)}" matched ({have[idx]} = {need[idx]}). Any change breaks that, so take it off the match count for now.
    // @no "{String.fromCharCode(a + idx)}" did not match yet ({have[idx]} vs {need[idx]} needed), so there is no match to lose.
    if (have[idx] === need[idx]) matches--;
    // @why Apply the change.
    // @say The window's count of "{String.fromCharCode(a + idx)}" goes {have[idx]} → {have[idx] + delta}; s1 needs {need[idx]}.
    have[idx] += delta; // @ask have[idx]===need[idx]
    // @why If it matches now, count it.
    // @yes Now "{String.fromCharCode(a + idx)}" has exactly the {need[idx]} s1 needs, so it counts as a match: {matches + 1} of 26.
    // @no "{String.fromCharCode(a + idx)}" is at {have[idx]} but s1 needs {need[idx]}, so it does not match. {matches} of 26 match.
    // @returns nothing; only one letter's count changed, so only it could change the match count.
    if (have[idx] === need[idx]) matches++;
  };

  // @why Slide the window one step at a time over the rest of `s2`.
  // @phase Slide: one letter in, one letter out
  // @yes Window {r - s1.length}..{r - 1} ("{s2.slice(r - s1.length, r)}") is ready to check.
  // @no The slide reached the end; one window, {s2.length - s1.length}..{s2.length - 1}, is still unchecked.
  for (let r = s1.length; r < s2.length; r++) {
    // @why All 26 letters match, so this window is a permutation.
    // @yes Every letter count matches, so "{s2.slice(r - s1.length, r)}" is a rearrangement of "{s1}".
    // @no Only {matches} of 26 letters match, so "{s2.slice(r - s1.length, r)}" is not a rearrangement. Slide on.
    // @returns true: "{s2.slice(r - s1.length, r)}" has exactly the letters of "{s1}".
    if (matches === 26) return true;
    // @why Add the new letter on the right edge.
    // @say "{s2[r]}" enters on the right.
    bump(s2.charCodeAt(r) - a, 1);
    // @why Remove the old letter that fell off the left edge.
    // @say "{s2[r - s1.length]}" leaves on the left, keeping the window {s1.length} long.
    // @then The window is now "{s2.slice(r - s1.length + 1, r + 1)}", with {matches} of 26 letters matching.
    bump(s2.charCodeAt(r - s1.length) - a, -1);
  }
  // @why Check the very last window, which the loop didn't test.
  // @phase Answer
  // @returns {matches === 26 ? "true: the last window \"" + s2.slice(s2.length - s1.length) + "\" has exactly the letters of \"" + s1 + "\"." : "false: the last window was the only one left, and only " + matches + " of 26 letters match. No window works."}
  return matches === 26;
}

test("567. Permutation in String", () => {
  assert.equal(checkInclusion("ab", "eidbaooo"), true);
  assert.equal(checkInclusion("ab", "eidboaoo"), false);
  assert.equal(checkInclusion("abc", "ab"), false);
  assert.equal(checkInclusion("adc", "dcda"), true);
});
