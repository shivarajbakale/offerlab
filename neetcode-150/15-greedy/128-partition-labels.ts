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

export function partitionLabels(s: string): number[] {
  const last = new Map<string, number>();
  for (let i = 0; i < s.length; i++) last.set(s[i], i);

  const result: number[] = [];
  let size = 0;
  let end = 0;
  for (let i = 0; i < s.length; i++) {
    size++;
    end = Math.max(end, last.get(s[i]) ?? i);
    if (i === end) {
      result.push(size);
      size = 0;
    }
  }
  return result;
}

test("763. Partition Labels", () => {
  assert.deepEqual(partitionLabels("ababcbacadefegdehijhklij"), [9, 7, 8]);
  assert.deepEqual(partitionLabels("eccbbbbdec"), [10]);
  assert.deepEqual(partitionLabels("abc"), [1, 1, 1]); // all distinct
});
