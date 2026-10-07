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
 *
 * Pattern: backtracking
 * Key insight: Each digit is an independent slot with 3-4 options, so the answer is a
 *   Cartesian product; recursion depth equals the number of digits and every leaf is a
 *   complete string. There is nothing to prune, so the recursion is just a clean way to
 *   nest a variable number of loops.
 * Real world: T9 predictive text on old phones expanding a keypress sequence into
 *   candidate letter strings before filtering them against a dictionary.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Maps each phone digit to the letters on its key.
const KEYPAD: Record<string, string> = {
  // @why Digits 0 and 1 have no letters, so the table starts at 2.
  "2": "abc",
  "3": "def",
  "4": "ghi",
  "5": "jkl",
  "6": "mno",
  // @why Keys 7 and 9 are special: they carry four letters instead of three.
  "7": "pqrs",
  "8": "tuv",
  "9": "wxyz",
};

// @rule cur holds one letter for each of digits[0..i-1]
// @why Returns every letter string the digits could spell.
// @goal which letter strings can the digits "{digits}" spell on a phone keypad?
export function letterCombinations(digits: string): string[] {
  // @why No digits means no combinations (not even an empty string).
  // @phase Setup
  // @yes No digits were pressed, so there is nothing to spell.
  // @no {digits.length} {digits.length === 1 ? "digit" : "digits"}, each with 3 or 4 letters: every string picks one letter per digit, so build them one digit at a time, branching on each letter. Nested loops can't do this, since their depth would have to match the number of digits.
  // @returns []: the problem defines no digits as no combinations, not one empty string.
  if (digits.length === 0) return [];
  // @why Collects all finished strings.
  const res: string[] = [];

  // @why `i` is which digit we are on; `cur` is the string built so far.
  // @goal with "{cur}" spelled so far, {i < digits.length ? "which strings can the remaining digits \"" + digits.slice(i) + "\" finish?" : "is anything left to add?"}
  const dfs = (i: number, cur: string): void => {
    // @why All digits used, so `cur` is a full combination.
    // @phase Pick a letter for the next digit
    // @yes Every digit has a letter, so "{cur}" is one complete string.
    // @no Digit "{digits[i]}" (position {i + 1} of {digits.length}) still needs a letter.
    if (i === digits.length) {
      // @why Save it. A string can't be changed later, so no copy is needed.
      // @say Record "{cur}". Each branch built its own new string with `cur + ch`, so nothing needs undoing or copying.
      res.push(cur); // @ask res.length // @moment found {cur}
      // @why Done with this branch.
      // @returns nothing; this branch is complete and gave "{cur}".
      return;
    }
    // @why Try each letter of this digit, and build the rest on top of it.
    // @say {ch ? "Letter \"" + ch + "\" for digit " + digits[i] + ": continue with \"" + cur + ch + "\"." : "Try each letter of digit " + digits[i] + " in turn."}
    for (const ch of KEYPAD[digits[i]]) dfs(i + 1, cur + ch);
    // @returns nothing; every letter of digit {digits[i]} has been tried after "{cur}".
  };

  // @why Start at the first digit with an empty string.
  // @phase Run the choices
  // @say Start at digit "{digits[0]}" with nothing spelled yet.
  dfs(0, "");
  // @why Return all combinations.
  // @returns all {res.length} strings: one per way to pick a letter for each digit.
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
