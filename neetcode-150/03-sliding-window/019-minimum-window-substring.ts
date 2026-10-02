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

export function minWindow(s: string, t: string): string {
  if (t.length === 0) return "";
  const need = new Map<string, number>();
  for (const ch of t) need.set(ch, (need.get(ch) ?? 0) + 1);

  const window = new Map<string, number>();
  const required = need.size;
  let have = 0;
  let bestL = 0;
  let bestLen = Infinity;
  let l = 0;

  for (let r = 0; r < s.length; r++) {
    const ch = s[r];
    window.set(ch, (window.get(ch) ?? 0) + 1);
    if (window.get(ch) === need.get(ch)) have++; // @say Does '{ch}' now fully satisfy one required character?

    while (have === required) { // @say Window covers all of t, so try shrinking from the left
      if (r - l + 1 < bestLen) { // @say Is this valid window of length {r - l + 1} the smallest yet?
        bestL = l;
        bestLen = r - l + 1;
      }
      const out = s[l];
      window.set(out, window.get(out)! - 1);
      const needed = need.get(out);
      if (needed !== undefined && window.get(out)! < needed) have--; // @say Dropping '{out}' may break coverage of t
      l++; // @say Shrink: move l right past '{s[l]}'
    }
  }
  return bestLen === Infinity ? "" : s.slice(bestL, bestL + bestLen);
}

test("76. Minimum Window Substring", () => {
  assert.equal(minWindow("ADOBECODEBANC", "ABC"), "BANC");
  assert.equal(minWindow("a", "a"), "a");
  assert.equal(minWindow("a", "aa"), "");
  assert.equal(minWindow("ab", "b"), "b");
  assert.equal(minWindow("aaflslflsldkalskaaa", "aaa"), "aaa");
});
