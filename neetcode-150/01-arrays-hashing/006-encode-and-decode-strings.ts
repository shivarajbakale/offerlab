/**
 * 271. Encode and Decode Strings (Premium; LintCode 659)
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/encode-and-decode-strings/
 *
 * Design an algorithm to encode a list of strings into a single string, and
 * decode that single string back into the original list. Strings may contain
 * any characters, including the delimiter you choose.
 *
 * Example 1:
 *   Input: ["neet", "code", "love", "you"]
 *   Output: ["neet", "code", "love", "you"]  (after encode then decode)
 *
 * Example 2:
 *   Input: ["we", "say", ":", "yes"]
 *   Output: ["we", "say", ":", "yes"]
 *
 * Constraints:
 *   0 <= strs.length < 100
 *   0 <= strs[i].length < 200
 *   strs[i] contains any possible characters.
 *
 * Approach: Length prefix
 *   Encode each string as "<length>#<string>". When decoding, read digits up
 *   to the '#', then take exactly that many characters. Because we jump by
 *   length, '#' characters inside the strings are never misread.
 *
 * Time: O(n) total characters   Space: O(n)
 *
 * Pattern: design
 * Key insight: No delimiter is safe when strings can contain any character, but a length
 *   prefix is: the decoder reads the length, then jumps exactly that far, so it never
 *   inspects the payload for separators.
 * Real world: Network protocols like HTTP/2 frames and Redis RESP prefix each message
 *   with its length so arbitrary binary data can be streamed and split reliably.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule i always points at the start of the next item's length number
// @why Pack many strings into one string that can be unpacked exactly.
// @goal how can {JSON.stringify(strs)} travel as one string and come back unchanged?
export function encode(strs: string[]): string {
  // @why Put the length and a `#` before each string so we know where it ends, whatever it contains.
  // @phase Encode: write each string's length before it
  // @say A plain separator fails: any character you pick might appear inside a string. So write each string's length and a `#` first. The reader then knows exactly how many characters to take, whatever they are.
  // @returns one string where every item carries its own length, so nothing inside an item can be mistaken for a boundary.
  return strs.map((s) => `${s.length}#${s}`).join("");
}

// @why Rebuild the original list of strings from the packed string.
// @goal which strings were packed into {JSON.stringify(str)}?
export function decode(str: string): string[] {
  // @why The strings we recover, in order.
  // @phase Decode: read a length, then take exactly that many characters
  const result: string[] = [];
  // @why `i` marks the start of the next length number.
  let i = 0;
  // @why Keep going until the whole packed string is read.
  // @yes Position {i} of {str.length}: by the rule, a length number starts here.
  // @no {i} reached the end, so every item has been read.
  while (i < str.length) {
    // @why `j` will scan forward to find the `#` after the length.
    let j = i;
    // @why The first `#` after the digits ends the length; the text can't confuse this.
    // @yes "{str[j]}" is still part of the length number, so step past it.
    // @no Found the `#` at {j}. It must end the length: the item text only starts after it, so a `#` inside the text can never be reached here.
    while (str[j] !== "#") j++;
    // @why Read the number in front of the `#`; it tells how many characters to take.
    // @say The digits "{str.slice(i, j)}" say the next item is {Number(str.slice(i, j))} characters long.
    const len = Number(str.slice(i, j)); // @ask len
    // @why Take exactly `len` characters after the `#`, even if they contain `#`.
    // @say Take exactly {len} characters after the `#`: "{str.slice(j + 1, j + 1 + len)}". Counting, not searching, is what makes a `#` or digit inside the text harmless.
    result.push(str.slice(j + 1, j + 1 + len)); // @moment decoded "{str.slice(j + 1, j + 1 + len)}"
    // @why Jump past the length, the `#`, and the string to the next item.
    // @then Recovered {JSON.stringify(result)}. The next length number starts at {i}.
    i = j + 1 + len; // @ask i
  }
  // @why All strings are recovered.
  // @returns {JSON.stringify(result)}, exactly the strings that were encoded.
  return result;
}

test("271. Encode and Decode Strings", () => {
  const cases = [
    ["neet", "code", "love", "you"],
    ["we", "say", ":", "yes"],
    [],
    [""],
    ["#", "12#ab", "", "a#b#c"],
  ];
  for (const strs of cases) assert.deepEqual(decode(encode(strs)), strs);
});
