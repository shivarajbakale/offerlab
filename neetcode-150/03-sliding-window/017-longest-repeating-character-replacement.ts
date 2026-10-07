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

// @viz best:best
// @rule the window needs at most k changes: its length minus its most common letter's count
// @why Return the longest stretch that can become one letter using at most `k` changes.
// @goal how long a stretch of "{s}" can become a single letter with at most {k} {k === 1 ? "change" : "changes"}?
export function characterReplacement(s: string, k: number): number {
  // @why How many of each letter are in the current window.
  // @phase Setup: letter counts for one sliding window
  // @say Testing every substring is n² windows. But a window is fixable exactly when (length − count of its most common letter) ≤ {k}: keep the common letter, change the rest. So slide one window and keep its counts up to date.
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
  // @phase Grow right; slide left when too many changes are needed
  // @yes Bring in "{s[r]}" at index {r}.
  // @no Every letter has been the right edge once, so the best window has been seen.
  for (let r = 0; r < s.length; r++) {
    // @why Slot number of the new letter.
    // @say "{s[r]}" maps to slot {s.charCodeAt(r) - A} of the 26 counters.
    const ci = s.charCodeAt(r) - A;
    // @why Add the new letter to the window counts.
    // @then The window {l}..{r} now has {counts[ci]} of "{s[r]}".
    counts[ci]++;
    // @why Track the biggest letter count; it never needs to shrink, since only a bigger one can beat `best`.
    // @say {counts[ci] > maxFreq ? "\"" + s[r] + "\" now appears " + counts[ci] + (counts[ci] === 1 ? " time" : " times") + ", more than the old max " + maxFreq + ", so it is the letter to keep." : "The most common count stays " + maxFreq + ". It is never lowered when the window slides: only a larger count could ever produce a longer window."}
    maxFreq = Math.max(maxFreq, counts[ci]); // @ask maxFreq
    // @why Letters other than the most common must be replaced; too many (over `k`) means shrink.
    // @yes Window {l}..{r} has {r - l + 1} letters; keeping {maxFreq} of the most common leaves {r - l + 1 - maxFreq} to change, more than {k}. Slide the left edge in by one: a shorter window can't beat the best anyway, so the window never needs to shrink further.
    // @no {r - l + 1} {r - l + 1 === 1 ? "letter" : "letters"} minus the top count {maxFreq} leaves {r - l + 1 - maxFreq} to change, within {k}, so the window keeps its size.
    while (r - l + 1 - maxFreq > k) { // @broken
      // @why Remove the left letter from the counts.
      // @say "{s[l]}" at {l} leaves the window, so its count drops.
      counts[s.charCodeAt(l) - A]--;
      // @why Move the left edge in.
      // @then The window is now {l}..{r}, back to {r - l + 1} letters.
      l++; // @ask l
    }
    // @why The window is valid now, so keep its size if it is the biggest.
    // @say Window length {r - l + 1}; best so far was {best}. {r - l + 1 > best ? "New best. The window can only grow when a letter's count reaches a new high, so this window really is fixable." : "Not longer, so best stays."}
    best = Math.max(best, r - l + 1);
  }
  // @why Longest valid window length.
  // @phase Answer
  // @returns {best}: the longest window whose letters, apart from the most common one, number at most {k}. Each edge only moved forward, so O(n).
  return best;
}

test("424. Longest Repeating Character Replacement", () => {
  assert.equal(characterReplacement("ABAB", 2), 4);
  assert.equal(characterReplacement("AABABBA", 1), 4);
  assert.equal(characterReplacement("A", 0), 1);
  assert.equal(characterReplacement("ABCD", 0), 1);
});
