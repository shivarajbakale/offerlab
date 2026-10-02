/**
 * 17. Letter Combinations of a Phone Number
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/letter-combinations-of-a-phone-number/
 *
 * Given a string of digits from 2-9, return every letter combination the
 * number could represent using the classic telephone keypad mapping
 * (2 -> "abc", 3 -> "def", ..., 7 -> "pqrs", 9 -> "wxyz"). Return the answer
 * in any order. An empty input yields an empty list.
 *
 * Example 1:
 *   Input: digits = "23"
 *   Output: ["ad","ae","af","bd","be","bf","cd","ce","cf"]
 *
 * Example 2:
 *   Input: digits = ""
 *   Output: []
 *
 * Example 3:
 *   Input: digits = "2"
 *   Output: ["a","b","c"]
 *
 * Constraints:
 *   0 <= digits.length <= 4
 *   digits[i] is a digit in the range ['2', '9']
 *
 * Approach: Backtracking over digits
 *   For digit i, try each of its letters, append it to the current string
 *   and recurse on digit i + 1. When every digit is consumed, record it.
 *
 * Time: O(n * 4^n)   Space: O(n) (excluding output)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const KEYPAD: Record<string, string> = {
  "2": "abc",
  "3": "def",
  "4": "ghi",
  "5": "jkl",
  "6": "mno",
  "7": "pqrs",
  "8": "tuv",
  "9": "wxyz",
};

export function letterCombinations(digits: string): string[] {
  if (digits.length === 0) return [];
  const res: string[] = [];

  const dfs = (i: number, cur: string): void => {
    if (i === digits.length) {
      res.push(cur);
      return;
    }
    for (const ch of KEYPAD[digits[i]]) dfs(i + 1, cur + ch);
  };

  dfs(0, "");
  return res;
}

test("17. Letter Combinations of a Phone Number", () => {
  assert.deepEqual(
    letterCombinations("23").sort(),
    ["ad", "ae", "af", "bd", "be", "bf", "cd", "ce", "cf"],
  );
  assert.deepEqual(letterCombinations(""), []);
  assert.deepEqual(letterCombinations("2").sort(), ["a", "b", "c"]);
  assert.equal(letterCombinations("7979").length, 256);
});
