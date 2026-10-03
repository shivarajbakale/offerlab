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
 *
 * Pattern: backtracking
 * Key insight: A partition is just a choice of where to cut, so from index i only try
 *   ends j where s[i..j] is already a palindrome. Rejecting a non-palindrome prefix
 *   immediately prunes every partition that would have started with it.
 * Real world: A text segmenter enumerating every way to split a token into valid
 *   dictionary pieces, where each piece must pass a validity check before going deeper.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns every way to cut `s` so each piece is a palindrome.
export function partition(s: string): string[][] {
  // @why Collects all valid partitions.
  const res: string[][] = [];
  // @why The pieces chosen so far.
  const path: string[] = [];

  // @why Checks if the part of `s` from `l` to `r` reads the same both ways.
  const isPali = (l: number, r: number): boolean => {
    // @why Compare from both ends and move inward until they meet.
    while (l < r) {
      // @why A mismatch means it is not a palindrome.
      if (s[l++] !== s[r--]) return false;
    }
    // @why Every pair matched, so it is a palindrome.
    return true;
  };

  // @why `dfs(i)` cuts up the part of `s` starting at index `i`.
  const dfs = (i: number): void => {
    // @why We reached the end of the string, so the pieces form one full partition.
    if (i === s.length) {
      // @why Save a copy, because `path` keeps changing.
      res.push([...path]);
      // @why This branch is done.
      return;
    }
    // @why Try every end position `j` for the next piece.
    for (let j = i; j < s.length; j++) {
      // @why Only palindrome pieces are allowed, so skip the others.
      if (!isPali(i, j)) continue;
      // @why Take the piece from `i` to `j` as the next part.
      path.push(s.slice(i, j + 1));
      // @why Cut the rest of the string after this piece.
      dfs(j + 1);
      // @why Backtrack: remove the piece to try a longer one.
      path.pop();
    }
  };

  // @why Start cutting from the beginning.
  dfs(0);
  // @why Return all partitions.
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
