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
// @goal what is the shortest stretch of "{s}" that contains every letter of "{t}", repeats included?
export function minWindow(s: string, t: string): string {
  // @why Nothing is needed, so the answer is empty.
  // @phase Setup: what t needs, and an empty window
  // @yes "{t}" is empty, so the empty string already covers it.
  // @no "{t}" has letters to cover.
  // @returns "": an empty t is covered by the empty window.
  if (t.length === 0) return "";
  // @why How many of each letter `t` requires.
  // @say Checking every substring of "{s}" against "{t}" is n² windows or worse. Instead grow a window right until it covers t, then shrink it from the left while it still does. Every end point is visited once by each edge.
  const need = new Map<string, number>();
  // @why Count the needed letters.
  // @say Tally each letter of "{t}", repeats included, so the window knows how many of each it must hold.
  for (const ch of t) need.set(ch, (need.get(ch) ?? 0) + 1);

  // @why Letter counts inside the current window.
  const window = new Map<string, number>();
  // @why How many different letters must be fully covered.
  // @say Rather than recompare every count each step, track one number: how many of the {need.size} distinct letters of t are fully covered. The window covers t exactly when that number reaches {need.size}.
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
  // @phase Grow right until t is covered
  // @yes Bring in "{s[r]}" at index {r}.
  // @no Every letter of "{s}" has been the right edge, so every candidate window has been seen.
  for (let r = 0; r < s.length; r++) {
    // @why The letter just added.
    // @say The window grows to {l}..{r} by taking in "{s[r]}".
    const ch = s[r];
    // @why Count the new letter.
    // @say The window now holds {(window.get(s[r]) ?? 0) + 1} of "{s[r]}".
    window.set(ch, (window.get(ch) ?? 0) + 1);
    // @why Does '{ch}' now fully satisfy one required character?
    // @yes The window now holds exactly the {need.get(ch)} "{ch}" that t needs, so "{ch}" just became covered: {have + 1} of {required}.
    // @no {!need.has(ch) ? "t has no \"" + ch + "\", so it doesn't help coverage" : window.get(ch) > need.get(ch) ? "\"" + ch + "\" was already covered; this is a spare copy (" + window.get(ch) + " of " + need.get(ch) + " needed)" : "\"" + ch + "\" is at " + window.get(ch) + " of the " + need.get(ch) + " needed, still short"}. Covered: {have} of {required}.
    if (window.get(ch) === need.get(ch)) have++; // @ask have

    // @why Window covers all of `t`, so try shrinking from the left.
    // @phase Shrink left while t stays covered
    // @yes Window {l}..{r} ("{s.slice(l, r + 1)}") covers all of "{t}". Record it, then try dropping its left letter: a shorter cover might exist.
    // @no {have === 0 ? "Nothing of t is covered yet" : "Only " + have + " of " + required + " letters are covered"}, so the window must grow more before it can be an answer.
    while (have === required) {
      // @why Only keep this window if it is shorter than the best.
      // @yes Length {r - l + 1} beats the best so far ({bestLen === Infinity ? "none yet" : bestLen}), so this is the new shortest cover.
      // @no Length {r - l + 1} is not shorter than the best, {bestLen}, so keep the old one.
      if (r - l + 1 < bestLen) {
        // @why Remember where the best window starts.
        // @say Record it: starts at {l}, {r - l + 1} long.
        bestL = l;
        // @why Remember how long it is.
        // @then Best cover so far: "{s.slice(bestL, bestL + bestLen)}" ({bestLen} {bestLen === 1 ? "letter" : "letters"}).
        bestLen = r - l + 1;
      }
      // @why The letter about to leave the window.
      // @say Try the shorter window: "{s[l]}" at {l} leaves.
      const out = s[l];
      // @why Remove it from the counts.
      // @say The window now holds {window.get(s[l]) - 1} of "{s[l]}".
      window.set(out, window.get(out)! - 1);
      // @why How many of that letter `t` needs, if any.
      // @say {need.has(out) ? "t needs " + need.get(out) + " of \"" + out + "\"; is the window still holding enough?" : "t has no \"" + out + "\", so losing it costs nothing."}
      const needed = need.get(out);
      // @why If we dropped below what `t` needs, the window no longer covers that letter.
      // @yes Dropping "{out}" leaves {window.get(out)} but t needs {needed}, so "{out}" is no longer covered. The window stops being an answer until another "{out}" arrives.
      // @no {needed === undefined ? "t has no \"" + out + "\"" : "Still " + window.get(out) + " \"" + out + "\" left, at least the " + needed + " needed"}, so the shorter window still covers t.
      // @say {needed === undefined ? "t has no \"" + out + "\", so the shorter window still covers t." : window.get(out) < needed ? "Dropping \"" + out + "\" leaves " + window.get(out) + " but t needs " + needed + ", so \"" + out + "\" is no longer covered. The window stops being an answer until another \"" + out + "\" arrives." : "Still " + window.get(out) + " \"" + out + "\" left, at least the " + needed + " needed, so the shorter window still covers t."}
      if (needed !== undefined && window.get(out)! < needed) have--;
      // @why Move the left edge in.
      // @say Shrink: move l right past "{s[l]}".
      l++; // @ask l
    }
  }
  // @why No window ever worked, so return empty; otherwise cut out the best one.
  // @phase Answer
  // @returns {bestLen === Infinity ? "\"\": no window of \"" + s + "\" ever covered \"" + t + "\"." : "\"" + s.slice(bestL, bestL + bestLen) + "\": the shortest of all the covering windows. Each edge only moved forward, so O(n)."}
  return bestLen === Infinity ? "" : s.slice(bestL, bestL + bestLen);
}

test("76. Minimum Window Substring", () => {
  assert.equal(minWindow("ADOBECODEBANC", "ABC"), "BANC");
  assert.equal(minWindow("a", "a"), "a");
  assert.equal(minWindow("a", "aa"), "");
  assert.equal(minWindow("ab", "b"), "b");
  assert.equal(minWindow("aaflslflsldkalskaaa", "aaa"), "aaa");
});
