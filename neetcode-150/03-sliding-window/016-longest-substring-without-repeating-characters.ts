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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function lengthOfLongestSubstring(s: string): number {
  const lastSeen = new Map<string, number>();
  let l = 0;
  let best = 0;
  for (let r = 0; r < s.length; r++) {
    const prev = lastSeen.get(s[r]);
    if (prev !== undefined && prev >= l) l = prev + 1;
    lastSeen.set(s[r], r);
    best = Math.max(best, r - l + 1);
  }
  return best;
}

test("3. Longest Substring Without Repeating Characters", () => {
  assert.equal(lengthOfLongestSubstring("abcabcbb"), 3);
  assert.equal(lengthOfLongestSubstring("bbbbb"), 1);
  assert.equal(lengthOfLongestSubstring("pwwkew"), 3);
  assert.equal(lengthOfLongestSubstring(""), 0);
  assert.equal(lengthOfLongestSubstring("abba"), 2);
});
