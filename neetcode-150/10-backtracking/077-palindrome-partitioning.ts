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
 *
 * Approach: Backtracking over cut positions
 *   From index i, try every end j >= i. If s[i..j] is a palindrome, add it
 *   to the current partition and recurse from j + 1. Reaching the end of the
 *   string means the current partition is complete.
 *
 * Time: O(n * 2^n)   Space: O(n) (excluding output)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function partition(s: string): string[][] {
  const res: string[][] = [];
  const path: string[] = [];

  const isPali = (l: number, r: number): boolean => {
    while (l < r) {
      if (s[l++] !== s[r--]) return false;
    }
    return true;
  };

  const dfs = (i: number): void => {
    if (i === s.length) {
      res.push([...path]);
      return;
    }
    for (let j = i; j < s.length; j++) {
      if (!isPali(i, j)) continue;
      path.push(s.slice(i, j + 1));
      dfs(j + 1);
      path.pop();
    }
  };

  dfs(0);
  return res;
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
