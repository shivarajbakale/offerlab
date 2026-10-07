/**
 * 3. Longest Substring Without Repeating Characters
 * Difficulty: Medium
 * Category: Sliding Window
 * LeetCode: https://leetcode.com/problems/longest-substring-without-repeating-characters/
 *
 * Given a string `s`, return the length of the longest substring (contiguous)
 * that contains no repeated characters.
 *
 * Example 1:
 *   Input: s = "abcabcbb"
 *   Output: 3   ("abc")
 *
 * Example 2:
 *   Input: s = "bbbbb"
 *   Output: 1   ("b")
 *
 * Example 3:
 *   Input: s = "pwwkew"
 *   Output: 3   ("wke")
 *
 * Constraints:
 *   0 <= s.length <= 5 * 10^4
 *   s consists of English letters, digits, symbols and spaces.
 *
 * Approach: Sliding window with last-seen index
 *   Expand the window with the right pointer. If the new character was seen
 *   inside the current window, jump the left pointer just past its previous
 *   occurrence. Track the max window length.
 *
 * Time: O(n)   Space: O(min(n, charset))
 *
 * Pattern: sliding-window
 * Key insight: When a repeated character enters the window, everything up to its previous
 *   position can never be in a valid answer, so jump l just past it instead of shrinking
 *   one step at a time.
 * Real world: A network monitor finding the longest run of distinct session IDs in a live
 *   log stream, keeping only the current window in memory.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @viz arc:r->prev best:best unique
// @rule every character inside the window is different
// @why Return the length of the longest stretch with no repeated character.
// @goal how long is the longest stretch of "{s}" with no repeated character?
export function lengthOfLongestSubstring(s: string): number {
  // @why Remember where each character was last seen, so a repeat can be found instantly.
  // @phase Setup: a window plus a memory of last positions
  // @say Checking every substring for repeats is n² or worse. Instead keep one window that never holds a repeat: grow it on the right, and when a repeat arrives, jump the left edge straight past the old copy using its remembered position.
  const lastSeen = new Map<string, number>();
  // @why `l` is the left edge of the window; everything from `l` to `r` has no repeats.
  let l = 0;
  // @why Longest window length so far.
  let best = 0;
  // @why Grow the window one character at a time by moving the right edge.
  // @phase Grow right; jump left past any repeat
  // @yes Bring in index {r} ("{s[r]}"). {r === l ? "The window is empty so far" : "The window " + l + ".." + (r - 1) + " has no repeats"}; only this new character could break that.
  // @no Every character has joined the window once, so every possible right end has been tried.
  for (let r = 0; r < s.length; r++) {
    // @why Look up where this character appeared before, if ever.
    // @say "{s[r]}" joins the window. Where did it last appear?
    const prev = lastSeen.get(s[r]);
    // @why A repeat only matters inside the window; then jump `l` past the old copy.
    // @yes The old "{s[r]}" at {prev} is inside the window {l}..{r - 1}. Any window starting at or before {prev} would contain two of them, so jump l to {prev + 1}.
    // @no {prev === undefined ? "\"" + s[r] + "\" has not appeared before" : "The old \"" + s[r] + "\" at " + prev + " is left of the window (which starts at " + l + ")"}, so the window still has no repeats and l stays.
    if (prev !== undefined && prev >= l) l = prev + 1; // @ask l
    // @why Store the newest position of this character.
    // @say Record "{s[r]}" at index {r}. A later "{s[r]}" will need exactly this position to know where to jump.
    lastSeen.set(s[r], r);
    // @why The window is valid now, so see if it is the longest.
    // @say Window {l}..{r} ("{s.slice(l, r + 1)}") has no repeats; its length is {r - l + 1}. Best so far was {best}. {r - l + 1 > best ? "New best." : "Not longer, so best stays."}
    best = Math.max(best, r - l + 1);
  }
  // @why Longest valid window length.
  // @phase Answer
  // @returns {best}: the longest repeat-free window over every right end. Each edge only moved forward, so O(n).
  return best;
}

test("3. Longest Substring Without Repeating Characters", () => {
  assert.equal(lengthOfLongestSubstring("abcabcbb"), 3);
  assert.equal(lengthOfLongestSubstring("bbbbb"), 1);
  assert.equal(lengthOfLongestSubstring("pwwkew"), 3);
  assert.equal(lengthOfLongestSubstring(""), 0);
  assert.equal(lengthOfLongestSubstring("abba"), 2);
});
