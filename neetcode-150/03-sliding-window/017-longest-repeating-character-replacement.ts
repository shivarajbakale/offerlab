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

export function characterReplacement(s: string, k: number): number {
  const counts = new Array<number>(26).fill(0);
  const A = "A".charCodeAt(0);
  let l = 0;
  let maxFreq = 0;
  let best = 0;
  for (let r = 0; r < s.length; r++) {
    const ci = s.charCodeAt(r) - A;
    counts[ci]++;
    maxFreq = Math.max(maxFreq, counts[ci]);
    while (r - l + 1 - maxFreq > k) {
      counts[s.charCodeAt(l) - A]--;
      l++;
    }
    best = Math.max(best, r - l + 1);
  }
  return best;
}

test("424. Longest Repeating Character Replacement", () => {
  assert.equal(characterReplacement("ABAB", 2), 4);
  assert.equal(characterReplacement("AABABBA", 1), 4);
  assert.equal(characterReplacement("A", 0), 1);
  assert.equal(characterReplacement("ABCD", 0), 1);
});
