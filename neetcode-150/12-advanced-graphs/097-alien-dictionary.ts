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
 *
 * Approach: Build graph from adjacent words + DFS topological sort
 *   For each adjacent pair, the first differing character gives an edge
 *   a -> b (a comes before b). If a word appears before its own prefix
 *   (e.g. "abc" before "ab"), the input is invalid. Then
 *   post-order DFS with cycle detection; reverse the post-order.
 *
 * Time: O(total characters)   Space: O(unique characters + edges)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function alienOrder(words: string[]): string {
  const adj = new Map<string, Set<string>>();
  for (const w of words) for (const ch of w) if (!adj.has(ch)) adj.set(ch, new Set());

  for (let i = 0; i + 1 < words.length; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    const minLen = Math.min(w1.length, w2.length);
    if (w1.length > w2.length && w1.slice(0, minLen) === w2.slice(0, minLen)) return "";
    for (let j = 0; j < minLen; j++) {
      if (w1[j] !== w2[j]) {
        adj.get(w1[j])!.add(w2[j]);
        break;
      }
    }
  }

  // false = visiting (on current path), true = done
  const state = new Map<string, boolean>();
  const post: string[] = [];

  const dfs = (ch: string): boolean => {
    if (state.has(ch)) return state.get(ch)!; // false here means a cycle
    state.set(ch, false);
    for (const nb of adj.get(ch)!) if (!dfs(nb)) return false;
    state.set(ch, true);
    post.push(ch);
    return true;
  };

  for (const ch of adj.keys()) if (!dfs(ch)) return "";
  return post.reverse().join("");
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
