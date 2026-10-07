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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function partitionLabels(s: string): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("763. Partition Labels", () => {
  assert.deepEqual(partitionLabels("ababcbacadefegdehijhklij"), [9, 7, 8]);
  assert.deepEqual(partitionLabels("eccbbbbdec"), [10]);
  assert.deepEqual(partitionLabels("abc"), [1, 1, 1]); // all distinct
});
