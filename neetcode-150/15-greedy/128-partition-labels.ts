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
export function partitionLabels(s: string): number[] {
  // @why `last` remembers the final index where each letter shows up.
  const last = new Map<string, number>();
  // @why Overwrite each time we see a letter, so the last write is its last position.
  for (let i = 0; i < s.length; i++) last.set(s[i], i);

  // @why The part sizes, in order.
  const result: number[] = [];
  // @why `size` is the length of the part being built.
  let size = 0;
  // @why `end` is the furthest index this part must stretch to, to include all copies of its letters.
  let end = 0;
  // @why Walk through the string once more.
  for (let i = 0; i < s.length; i++) {
    // @why Add this character to the current part.
    size++;
    // @why This letter may force the part to extend to its last occurrence.
    end = Math.max(end, last.get(s[i]) ?? i); // @ask end
    // @why When we reach `end`, no letter in this part appears later, so the part can be cut here.
    if (i === end) {
      // @why Save the finished part's size.
      result.push(size); // @moment cut a part of {size}
      // @why Start counting the next part from zero.
      size = 0;
    }
  }
  // @why These sizes are the answer.
  return result;
}

test("763. Partition Labels", () => {
  assert.deepEqual(partitionLabels("ababcbacadefegdehijhklij"), [9, 7, 8]);
  assert.deepEqual(partitionLabels("eccbbbbdec"), [10]);
  assert.deepEqual(partitionLabels("abc"), [1, 1, 1]); // all distinct
});
