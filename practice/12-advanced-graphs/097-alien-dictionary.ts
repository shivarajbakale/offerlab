/**
 * 269. Alien Dictionary (Premium; LintCode 892)
 * Difficulty: Hard
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/alien-dictionary/
 *
 * An alien language uses the lowercase English letters in an unknown order.
 * You are given a list of `words` from its dictionary, sorted
 * lexicographically by the alien rules. Derive and return a string of the
 * unique letters in the words, ordered by the alien language. If the order
 * is invalid (contradictory), return "". If several orders are valid,
 * return any of them.
 *
 * Example 1:
 *   Input: words = ["wrt","wrf","er","ett","rftt"]
 *   Output: "wertf"
 *
 * Example 2:
 *   Input: words = ["z","x"]
 *   Output: "zx"
 *
 * Example 3:
 *   Input: words = ["z","x","z"]
 *   Output: ""
 *   Explanation: z < x and x < z is a contradiction.
 *
 * Constraints:
 *   1 <= words.length <= 100
 *   1 <= words[i].length <= 100
 *   words[i] consists of lowercase English letters
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function alienOrder(words: string[]): string {
  // TODO: implement
  throw new Error("Not implemented");
}

/** Checks `order` contains exactly the letters of `words` and respects their sorting. */
function isValidOrder(words: string[], order: string): boolean {
  const letters = new Set(words.join(""));
  if (order.length !== letters.size || new Set(order).size !== letters.size) return false;
  const rank = new Map([...order].map((ch, i) => [ch, i]));
  for (let i = 0; i + 1 < words.length; i++) {
    const [a, b] = [words[i], words[i + 1]];
    let j = 0;
    while (j < a.length && j < b.length && a[j] === b[j]) j++;
    if (j === a.length || j === b.length) {
      if (a.length > b.length) return false;
      continue;
    }
    if (rank.get(a[j])! > rank.get(b[j])!) return false;
  }
  return true;
}

test("269. Alien Dictionary", () => {
  const w1 = ["wrt", "wrf", "er", "ett", "rftt"];
  assert.equal(alienOrder(w1), "wertf");
  assert.ok(isValidOrder(w1, alienOrder(w1)));
  assert.equal(alienOrder(["z", "x"]), "zx");
  assert.equal(alienOrder(["z", "x", "z"]), "");
  assert.equal(alienOrder(["abc", "ab"]), "");
  const w2 = ["ab", "adc"];
  assert.ok(isValidOrder(w2, alienOrder(w2)));
});
