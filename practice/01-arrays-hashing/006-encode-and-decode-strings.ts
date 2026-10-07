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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function encode(strs: string[]): string {
  // TODO: implement
  throw new Error("Not implemented");
}

export function decode(str: string): string[] {
  // TODO: implement
  throw new Error("Not implemented");
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
