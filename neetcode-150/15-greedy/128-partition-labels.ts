/**
 * 763. Partition Labels
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/partition-labels/
 *
 * Given a string `s`, partition it into as many parts as possible so that
 * each letter appears in at most one part. Concatenating the parts in order
 * must give back `s`. Return the sizes of the parts.
 *
 * Example 1:
 *   Input: s = "ababcbacadefegdehijhklij"
 *   Output: [9, 7, 8]   ("ababcbaca", "defegde", "hijhklij")
 *
 * Example 2:
 *   Input: s = "eccbbbbdec"
 *   Output: [10]
 *
 * Constraints:
 *   1 <= s.length <= 500
 *   s consists of lowercase English letters.
 *
 * Approach: Last occurrence + greedy extend
 *   Record the last index of every character. Scan left to right, extending
 *   the current partition's end to the last occurrence of each character
 *   seen. When the scan index equals that end, nothing in the partition
 *   appears later, so close it and start a new one.
 *
 * Time: O(n)   Space: O(1) (at most 26 letters)
 *
 * Pattern: greedy
 * Key insight: Once you know each letter's last index, a partition must extend at least to
 *   the last occurrence of every letter inside it. When the scan reaches that running end,
 *   nothing inside appears later, so cutting there is safe and earliest.
 * Real world: Splitting a log or event stream into the most independent chunks so every
 *   session ID lives entirely in one chunk, letting chunks be processed in parallel.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule end is the last index of any letter seen so far in the current part
// @why Returns the sizes of the parts, where each letter appears in only one part.
// @goal how do you cut "{s}" into as many parts as possible, with each letter in only one part?
export function partitionLabels(s: string): number[] {
  // @why `last` remembers the final index where each letter shows up.
  // @phase Setup: where each letter appears for the last time
  // @say Trying every set of cut points and checking each is slow. The only thing a cut needs to know is whether a letter in the current part shows up again later, and that is answered by each letter's last index, recorded in one pass.
  const last = new Map<string, number>();
  // @why Overwrite each time we see a letter, so the last write is its last position.
  // @yes Index {i}: "{s[i]}"{last.has(s[i]) ? " again, so its last index moves from " + last.get(s[i]) + " to " + i : ", seen for the first time"}. The final write per letter is its last position.
  // @no Every letter now maps to its last index.
  for (let i = 0; i < s.length; i++) last.set(s[i], i);

  // @why The part sizes, in order.
  const result: number[] = [];
  // @why `size` is the length of the part being built.
  let size = 0;
  // @why `end` is the furthest index this part must stretch to, to include all copies of its letters.
  let end = 0;
  // @why Walk through the string once more.
  // @phase Second pass: stretch the part to cover its letters, cut when nothing is left owed
  // @yes Index {i}: "{s[i]}".
  // @no The whole string has been cut into parts.
  for (let i = 0; i < s.length; i++) {
    // @why Add this character to the current part.
    // @say "{s[i]}" joins the current part, now {size + 1} long.
    size++;
    // @why This letter may force the part to extend to its last occurrence.
    // @say "{s[i]}" last appears at {last.get(s[i])}. The part must reach at least {Math.max(end, last.get(s[i]) ?? i)}{last.get(s[i]) > end ? ", so it stretches from " + end : ", which it already does"}.
    end = Math.max(end, last.get(s[i]) ?? i); // @ask end
    // @why When we reach `end`, no letter in this part appears later, so the part can be cut here.
    // @yes Reached {end}: every letter in this part has had its last copy, so cutting here strands nothing, and cutting as early as possible leaves the most room for more parts.
    // @no Not there yet: some letter in this part still appears at index {end}, so a cut now would split it.
    if (i === end) {
      // @why Save the finished part's size.
      // @say Cut: a part of {size}.
      result.push(size); // @moment cut a part of {size}
      // @why Start counting the next part from zero.
      size = 0;
    }
  }
  // @why These sizes are the answer.
  // @phase Answer
  // @returns {JSON.stringify(result)}: each cut came at the first point it was safe, so no part could be split further. O(n) time.
  return result;
}

test("763. Partition Labels", () => {
  assert.deepEqual(partitionLabels("ababcbacadefegdehijhklij"), [9, 7, 8]);
  assert.deepEqual(partitionLabels("eccbbbbdec"), [10]);
  assert.deepEqual(partitionLabels("abc"), [1, 1, 1]); // all distinct
});
