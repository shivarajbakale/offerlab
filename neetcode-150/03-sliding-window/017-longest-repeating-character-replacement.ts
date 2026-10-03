/**
 * 424. Longest Repeating Character Replacement
 * Difficulty: Medium
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/longest-repeating-character-replacement/
 *
 * Given a string `s` of uppercase English letters and an integer `k`, you may
 * change at most `k` characters to any other uppercase letter. Return the
 * length of the longest substring containing a single repeated letter you can
 * obtain.
 *
 * Example 1:
 *   Input: s = "ABAB", k = 2
 *   Output: 4
 *
 * Example 2:
 *   Input: s = "AABABBA", k = 1
 *   Output: 4
 *
 * Constraints:
 *   1 <= s.length <= 10^5
 *   0 <= k <= s.length
 *
 * Approach: Sliding window with max frequency
 *   A window is valid if (window length - count of its most frequent letter)
 *   <= k. Grow the window to the right; when invalid, shrink from the left.
 *   maxFreq never needs to decrease: only a larger maxFreq can beat the best.
 *
 * Time: O(n)   Space: O(1) (26 letters)
 *
 * Pattern: sliding-window
 * Key insight: A window is fixable when its length minus its most common letter count is
 *   at most k. The answer only grows if maxFreq grows, so maxFreq never needs to be
 *   lowered when the window shrinks.
 * Real world: A DNA analysis tool finding the longest region that becomes uniform with at
 *   most k base corrections.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Return the longest stretch that can become one letter using at most `k` changes.
export function characterReplacement(s: string, k: number): number {
  // @why How many of each letter are in the current window.
  const counts = new Array<number>(26).fill(0);
  // @why The code of 'A', so letters map to slots 0 to 25.
  const A = "A".charCodeAt(0);
  // @why `l` is the left edge of the window.
  let l = 0;
  // @why Count of the most common letter seen in the window; the rest are the ones to replace.
  let maxFreq = 0;
  // @why Longest valid window so far.
  let best = 0;
  // @why Grow the window by moving the right edge.
  for (let r = 0; r < s.length; r++) {
    // @why Slot number of the new letter.
    const ci = s.charCodeAt(r) - A;
    // @why Add the new letter to the window counts.
    counts[ci]++;
    // @why Track the biggest letter count; it never needs to shrink, since only a bigger one can beat `best`.
    maxFreq = Math.max(maxFreq, counts[ci]);
    // @why Letters other than the most common must be replaced; too many (over `k`) means shrink.
    while (r - l + 1 - maxFreq > k) {
      // @why Remove the left letter from the counts.
      counts[s.charCodeAt(l) - A]--;
      // @why Move the left edge in.
      l++;
    }
    // @why The window is valid now, so keep its size if it is the biggest.
    best = Math.max(best, r - l + 1);
  }
  // @why Longest valid window length.
  return best;
}

test("424. Longest Repeating Character Replacement", () => {
  assert.equal(characterReplacement("ABAB", 2), 4);
  assert.equal(characterReplacement("AABABBA", 1), 4);
  assert.equal(characterReplacement("A", 0), 1);
  assert.equal(characterReplacement("ABCD", 0), 1);
});
