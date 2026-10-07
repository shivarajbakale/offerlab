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
 *
 * Approach: Variable sliding window with have/need counters
 *   Count required characters of t. Expand right; when a character's window
 *   count reaches its required count, increment `have`. While have == need
 *   (window satisfies t), record it and shrink from the left.
 *
 * Time: O(|s| + |t|)   Space: O(charset)
 *
 * Pattern: sliding-window
 * Key insight: Tracking how many distinct characters are fully satisfied turns "does the
 *   window cover t?" into one integer comparison, so the window can grow until valid and
 *   then shrink greedily to the smallest valid form.
 * Real world: Finding the shortest log excerpt that mentions every service involved in an
 *   incident, to show an on-call engineer the tightest context.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz best:bestLen
// @rule while the window covers all of t, shrink it from the left
// @why Return the shortest part of `s` that holds every letter of `t`.
export function minWindow(s: string, t: string): string {
  // @why Nothing is needed, so the answer is empty.
  if (t.length === 0) return "";
  // @why How many of each letter `t` requires.
  const need = new Map<string, number>();
  // @why Count the needed letters.
  for (const ch of t) need.set(ch, (need.get(ch) ?? 0) + 1);

  // @why Letter counts inside the current window.
  const window = new Map<string, number>();
  // @why How many different letters must be fully covered.
  const required = need.size;
  // @why How many different letters are fully covered now.
  let have = 0;
  // @why Start of the best window found.
  let bestL = 0;
  // @why Length of the best window found; Infinity means none yet.
  let bestLen = Infinity;
  // @why `l` is the left edge of the window.
  let l = 0;

  // @why Grow the window by moving the right edge.
  for (let r = 0; r < s.length; r++) {
    // @why The letter just added.
    const ch = s[r];
    // @why Count the new letter.
    window.set(ch, (window.get(ch) ?? 0) + 1);
    // @why Does '{ch}' now fully satisfy one required character?
    if (window.get(ch) === need.get(ch)) have++; // @ask have // @say Does '{ch}' now fully satisfy one required character?

    // @why Window covers all of `t`, so try shrinking from the left.
    while (have === required) { // @say Window covers all of t, so try shrinking from the left
      // @why Only keep this window if it is shorter than the best.
      if (r - l + 1 < bestLen) { // @say Is this valid window of length {r - l + 1} the smallest yet?
        // @why Remember where the best window starts.
        bestL = l;
        // @why Remember how long it is.
        bestLen = r - l + 1;
      }
      // @why The letter about to leave the window.
      const out = s[l];
      // @why Remove it from the counts.
      window.set(out, window.get(out)! - 1);
      // @why How many of that letter `t` needs, if any.
      const needed = need.get(out);
      // @why If we dropped below what `t` needs, the window no longer covers that letter.
      if (needed !== undefined && window.get(out)! < needed) have--; // @say Dropping '{out}' may break coverage of t
      // @why Move the left edge in.
      l++; // @ask l // @say Shrink: move l right past '{s[l]}'
    }
  }
  // @why No window ever worked, so return empty; otherwise cut out the best one.
  return bestLen === Infinity ? "" : s.slice(bestL, bestL + bestLen);
}

test("76. Minimum Window Substring", () => {
  assert.equal(minWindow("ADOBECODEBANC", "ABC"), "BANC");
  assert.equal(minWindow("a", "a"), "a");
  assert.equal(minWindow("a", "aa"), "");
  assert.equal(minWindow("ab", "b"), "b");
  assert.equal(minWindow("aaflslflsldkalskaaa", "aaa"), "aaa");
});
