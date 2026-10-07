/**
 * 131. Palindrome Partitioning
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/palindrome-partitioning/
 *
 * Given a string `s`, split it so that every substring of the partition is a
 * palindrome. Return all possible such palindrome partitionings, in any
 * order.
 *
 * Example 1:
 *   Input: s = "aab"
 *   Output: [["a", "a", "b"], ["aa", "b"]]
 *
 * Example 2:
 *   Input: s = "a"
 *   Output: [["a"]]
 *
 * Constraints:
 *   1 <= s.length <= 16
 *   s contains only lowercase English letters
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function partition(s: string): string[][] {
  // TODO: implement
  throw new Error("Not implemented");
}

const normalize = (xs: string[][]) => xs.map((x) => x.join("|")).sort();

test("131. Palindrome Partitioning", () => {
  assert.deepEqual(normalize(partition("aab")), normalize([["a", "a", "b"], ["aa", "b"]]));
  assert.deepEqual(partition("a"), [["a"]]);
  assert.deepEqual(
    normalize(partition("aba")),
    normalize([["a", "b", "a"], ["aba"]]),
  );
});
