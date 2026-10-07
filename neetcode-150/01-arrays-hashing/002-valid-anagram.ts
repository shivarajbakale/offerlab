/**
 * 242. Valid Anagram
 * Difficulty: Easy
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/valid-anagram/
 *
 * Given two strings `s` and `t`, return true if `t` is an anagram of `s`
 * (uses exactly the same characters with the same counts), otherwise false.
 *
 * Example 1:
 *   Input: s = "anagram", t = "nagaram"
 *   Output: true
 *
 * Example 2:
 *   Input: s = "rat", t = "car"
 *   Output: false
 *
 * Constraints:
 *   1 <= s.length, t.length <= 5 * 10^4
 *   s and t consist of lowercase English letters.
 *
 * Approach: Character counts
 *   If lengths differ, they cannot be anagrams. Otherwise increment a count
 *   per character of `s` and decrement per character of `t`; every count must
 *   end at zero.
 *
 * Time: O(n)   Space: O(1) (26 letters)
 *
 * Pattern: hashing
 * Key insight: Anagrams are equal as multisets, so order does not matter, only counts.
 *   Adding for s and subtracting for t in one array means a single all-zero check settles
 *   it.
 * Real world: A spell checker suggesting words that use exactly the letters typed, by
 *   comparing letter-count signatures.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule counts[x] is how many x's s has had so far minus how many t has had
// @why Return true if `t` uses exactly the same letters as `s`.
// @goal does "{t}" use exactly the letters of "{s}"?
export function isAnagram(s: string, t: string): boolean {
  // @why Different lengths can never match, so quit early.
  // @phase Quick check: an anagram must have the same length
  // @yes {s.length} letters vs {t.length}: some letter has to be extra or missing, so no rearrangement can match.
  // @no Both have {s.length} letters, so they could still be rearrangements. Lengths alone can't tell; count the letters.
  // @returns false: different lengths can never be anagrams.
  if (s.length !== t.length) return false;
  // @why One counter per letter a-z; `s` adds to it and `t` takes away.
  // @phase Setup: one balance per letter
  // @say Sorting both strings works but costs n log n. Order doesn't matter for an anagram, only how many of each letter, so keep a balance per letter: `s` adds, `t` subtracts.
  const counts = new Array<number>(26).fill(0);
  // @why The code of 'a', so a letter's code minus this gives its slot 0 to 25.
  const a = "a".charCodeAt(0);
  // @why Both strings have the same length, so one loop walks them together.
  // @phase One pass: s adds each letter, t takes one away
  // @yes Position {i}: "{s[i]}" from s and "{t[i]}" from t. Both strings have the same length, so one index walks them together.
  // @no Both strings are fully counted. If they use the same letters, every add was cancelled by a subtract.
  for (let i = 0; i < s.length; i++) {
    // @why Count this letter of `s` as one more.
    // @say "{s[i]}" from s: its balance goes up by one.
    counts[s.charCodeAt(i) - a]++;
    // @why Cancel one of this letter using `t`.
    // @say "{t[i]}" from t: its balance goes down by one. Going below zero is fine for now: t is ahead on "{t[i]}", and s may catch up later.
    // @then Nonzero balances: {JSON.stringify(Object.fromEntries(counts.map((c, x) => [String.fromCharCode(a + x), c]).filter((e) => e[1] !== 0)))}
    counts[t.charCodeAt(i) - a]--; // @ask counts[t.charCodeAt(i)-a]
  }
  // @why If every letter cancelled out to zero, the two strings have the same letters.
  // @phase Verdict: did every balance return to zero?
  // @say Every letter of s added one and every letter of t removed one. All balances are zero exactly when both strings hold the same multiset of letters.
  // @returns {counts.every((c) => c === 0) ? "true: every letter balanced out" : "false: some letter count didn't cancel"}.
  return counts.every((c) => c === 0);
}

test("242. Valid Anagram", () => {
  assert.equal(isAnagram("anagram", "nagaram"), true);
  assert.equal(isAnagram("rat", "car"), false);
  assert.equal(isAnagram("a", "ab"), false);
  assert.equal(isAnagram("aacc", "ccac"), false);
});
