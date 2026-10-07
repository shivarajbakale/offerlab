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

// @rule every piece in path is a palindrome and together they spell s[0..i-1]
// @why Returns every way to cut `s` so each piece is a palindrome.
// @goal in how many ways, and which, can "{s}" be cut so every piece is a palindrome?
export function partition(s: string): string[][] {
  // @why Collects all valid partitions.
  // @phase Setup
  // @say There are 2^{s.length - 1} ways to place cuts in "{s}", and checking each afterwards wastes work on cuts that already failed. Instead choose the pieces left to right and only continue past a piece that is a palindrome, so bad prefixes are dropped at once.
  const res: string[][] = [];
  // @why The pieces chosen so far.
  const path: string[] = [];

  // @why Checks if the part of `s` from `l` to `r` reads the same both ways.
  // @goal is "{s.slice(l, r + 1)}" a palindrome?
  const isPali = (l: number, r: number): boolean => {
    // @why Compare from both ends and move inward until they meet.
    // @yes Positions {l} and {r} haven't met yet, so there is a pair to compare.
    // @no The ends met in the middle with every pair matching.
    while (l < r) {
      // @why A mismatch means it is not a palindrome.
      // @yes "{s[l]}" at {l} and "{s[r]}" at {r} differ, so the piece reads differently backwards.
      // @no "{s[l]}" matches "{s[r]}"; move both ends inward.
      // @returns false: one mismatched pair is enough to rule it out.
      if (s[l++] !== s[r--]) return false;
    }
    // @why Every pair matched, so it is a palindrome.
    // @returns true: every mirrored pair matched.
    return true;
  };

  // @why `dfs(i)` cuts up the part of `s` starting at index `i`.
  // @goal with {JSON.stringify(path)} cut off, {i < s.length ? "in which ways can the rest, \"" + s.slice(i) + "\", be cut into palindromes?" : "is anything left to cut?"}
  const dfs = (i: number): void => {
    // @why We reached the end of the string, so the pieces form one full partition.
    // @phase Choose the next piece, keep it only if it is a palindrome
    // @yes Nothing is left to cut: {JSON.stringify(path)} covers all of "{s}" with palindromes.
    // @no "{s.slice(i)}" still needs cutting.
    if (i === s.length) {
      // @why Save a copy, because `path` keeps changing.
      // @say Record a copy of {JSON.stringify(path)}. `path` keeps changing as choices are undone, so storing it directly would change this answer too.
      res.push([...path]); // @ask res.length // @moment found {JSON.stringify(path)}
      // @why This branch is done.
      // @returns nothing; this branch is complete and gave {JSON.stringify(path)}.
      return;
    }
    // @why Try every end position `j` for the next piece.
    // @yes {j < i ? "Try each length for the next piece, starting at index " + i + "." : "Next piece to try: \"" + s.slice(i, j + 1) + "\" (indices " + i + " to " + j + ")."}
    // @no Every piece starting at index {i} has been tried.
    for (let j = i; j < s.length; j++) {
      // @why Only palindrome pieces are allowed, so skip the others.
      // @yes "{s.slice(i, j + 1)}" is not a palindrome, so no partition can use it. Skip without exploring the rest.
      // @no "{s.slice(i, j + 1)}" is a palindrome, so it can be the next piece.
      // @say {s.slice(i, j + 1) === s.slice(i, j + 1).split("").reverse().join("") ? "\"" + s.slice(i, j + 1) + "\" reads the same backwards, so it can be the next piece." : "\"" + s.slice(i, j + 1) + "\" is not a palindrome, so no partition can use it. Skip without exploring the rest."}
      if (!isPali(i, j)) continue;
      // @why Take the piece from `i` to `j` as the next part.
      // @say Cut off "{s.slice(i, j + 1)}" as the next piece.
      path.push(s.slice(i, j + 1)); // @ask path.length
      // @why Cut the rest of the string after this piece.
      // @say {j + 1 === s.length ? "Nothing is left after it; the next call records the partition." : "Now cut the rest, \"" + s.slice(j + 1) + "\", every possible way."}
      dfs(j + 1);
      // @why Backtrack: remove the piece to try a longer one.
      // @say Every partition starting {JSON.stringify(path)} has been explored. Undo: drop "{s.slice(i, j + 1)}" and try a longer piece.
      path.pop();
    }
    // @returns nothing; every palindrome piece starting at index {i} has been tried.
  };

  // @why Start cutting from the beginning.
  // @phase Run the choices
  // @say Start with no cuts made.
  dfs(0);
  // @why Return all partitions.
  // @returns all {res.length} ways to cut "{s}" into palindromes.
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
