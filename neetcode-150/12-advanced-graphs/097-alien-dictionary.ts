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
 *
 * Pattern: topological-sort, graph-dfs
 * Key insight: Only the first differing character of each adjacent word pair gives
 *   information, and it gives exactly one edge. Any letter order consistent with those
 *   edges is a topological sort, and a cycle (or a word before its own prefix) means no
 *   valid order exists.
 * Real world: Inferring a collation or ordering rule from a sorted export, such as
 *   recovering a custom sort order from an already-sorted list of records.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule a letter enters post only after every letter that must follow it
// @why Returns the alien letter order, or an empty string if the words can't be valid.
// @goal what alphabet order makes {JSON.stringify(words)} sorted, if any does?
export function alienOrder(words: string[]): string {
  // @why For each letter, the letters that must come after it.
  // @phase Setup: one node per letter
  // @say Trying every ordering of the letters is factorial. But each pair of neighbouring words gives at most one rule "x before y", and an order that obeys every rule is a topological sort of those rules.
  const adj = new Map<string, Set<string>>();
  // @why Add every letter that appears in any word as a node.
  // @say "{ch}" from "{w}": {adj.has(ch) ? "already has a node." : "new letter, so give it a node, even if no rule ever mentions it."}
  for (const w of words) for (const ch of w) if (!adj.has(ch)) adj.set(ch, new Set());

  // @why Compare each pair of neighboring words; their first different letter gives an order rule.
  // @phase Read one rule from each pair of neighbouring words
  // @yes Compare "{words[i]}" with the next word, "{words[i + 1]}".
  // @no Every neighbouring pair has been compared; the rules are all in.
  for (let i = 0; i + 1 < words.length; i++) {
    // @why The earlier word.
    // @say Only neighbouring words need comparing: if a ≤ b ≤ c in the list, the rule between a and c already follows from a-b and b-c.
    const w1 = words[i];
    // @why The later word.
    const w2 = words[i + 1];
    // @why Only the shared length can be compared.
    // @say Only the first {Math.min(w1.length, w2.length)} letters, the length both words have, can be compared.
    const minLen = Math.min(w1.length, w2.length);
    // @why If a longer word comes before its own prefix, the order is impossible.
    // @yes "{w1}" comes before its own prefix "{w2}". In any alphabet a prefix sorts first, so this list can't be sorted.
    // @no {w1.length > w2.length ? "\"" + w2 + "\" is not a prefix of \"" + w1 + "\"" : "\"" + w1 + "\" is not longer than \"" + w2 + "\""}, so the order of these two is possible.
    // @returns "": no alphabet can put a word before its own prefix.
    if (w1.length > w2.length && w1.slice(0, minLen) === w2.slice(0, minLen)) return "";
    // @why Look for the first position where the two words differ.
    // @yes Position {j}: "{w1[j]}" vs "{w2[j]}".
    // @no All {minLen} shared {minLen === 1 ? "letter matches" : "letters match"}, so this pair gives no rule.
    for (let j = 0; j < minLen; j++) {
      // @why The first difference tells us which letter comes first.
      // @yes "{w1[j]}" ≠ "{w2[j]}" at the first difference, and "{w1}" sorts before "{w2}", so {w1[j]} must come before {w2[j]}.
      // @no Both have "{w1[j]}" here, so the order is decided later in the words.
      if (w1[j] !== w2[j]) {
        // @why Record the rule: `w1[j]` comes before `w2[j]`.
        // @say Record the rule {w1[j]} → {w2[j]}: "{w1[j]}" comes before "{w2[j]}".
        adj.get(w1[j])!.add(w2[j]); // @moment {w1[j]} comes before {w2[j]}
        // @why Later letters tell us nothing, so stop.
        // @say Stop at the first difference: the letters after it don't affect how these two words sort.
        break;
      }
    }
  }

  // false = visiting (on current path), true = done
  // @why Tracks each letter: false means it is being visited now, true means it is finished.
  // @phase Topological sort: finish every letter after all letters it must precede
  const state = new Map<string, boolean>();
  // @why Letters in finished order (the last-finished is placed first at the end).
  const post: string[] = [];

  // @why Visits a letter; returns false if a cycle is found.
  // @goal can "{ch}" and every letter that must come after it be finished without a cycle?
  const dfs = (ch: string): boolean => {
    // @why If seen already, a false value means we looped back onto the current path, which is a cycle.
    // @yes "{ch}" has been seen. {state.get(ch) ? "It is already finished and placed, so nothing to do." : "It is still on the current path, so the rules loop back on themselves: a cycle."}
    // @no "{ch}" is new. Visit it.
    // @returns {state.get(ch) ? "true: \"" + ch + "\" was finished earlier with no cycle." : "false: \"" + ch + "\" must come both before and after itself, so no order exists."}
    if (state.has(ch)) return state.get(ch)!; // false here means a cycle
    // @why Mark it as being visited.
    // @say Mark "{ch}" as on the current path. Meeting it again before it finishes would mean a cycle.
    state.set(ch, false);
    // @why Visit every letter that must come after it; a cycle anywhere means failure.
    // @say {adj.get(ch).size ? "Letters that must follow \"" + ch + "\": " + JSON.stringify([...adj.get(ch)]) + ". Finish each of them first." : "No letter has to come after \"" + ch + "\", so there is nothing to finish first."}
    // @returns false: a letter after "{ch}" hit a cycle, so the failure passes straight up.
    for (const nb of adj.get(ch)!) if (!dfs(nb)) return false;
    // @why All followers are done, so mark it finished.
    // @say Every letter after "{ch}" finished with no cycle, so "{ch}" is finished too. Reaching it again later is safe.
    state.set(ch, true);
    // @why Add it after everything that must come after it.
    // @say Every letter after "{ch}" is already in the finish list, so add "{ch}" now. Reversed at the end, it lands before all of them.
    post.push(ch); // @ask post.length
    // @why No cycle found here.
    // @returns true: "{ch}" and everything after it are placed, with no cycle.
    return true;
  };

  // @why Start a visit from every letter; any cycle means no valid order.
  // @say Start from each letter in turn, so letters with no rules still get placed.
  // @returns "": the rules contain a cycle, so no alphabet can satisfy them all.
  for (const ch of adj.keys()) if (!dfs(ch)) return "";
  // @why Reversing the finish order puts earlier letters first.
  // @phase Answer
  // @returns "{post.join("")}": the finish order reversed, so every letter sits before all the letters it must precede.
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
