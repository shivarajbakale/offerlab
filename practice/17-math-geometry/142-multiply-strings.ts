/**
 * 43. Multiply Strings
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/multiply-strings/
 *
 * Given two non-negative integers `num1` and `num2` as strings, return their
 * product, also as a string. You may not use a big-integer library or
 * convert the inputs to integers directly.
 *
 * Example 1:
 *   Input: num1 = "2", num2 = "3"
 *   Output: "6"
 *
 * Example 2:
 *   Input: num1 = "123", num2 = "456"
 *   Output: "56088"
 *
 * Constraints:
 *   1 <= num1.length, num2.length <= 200
 *   num1 and num2 consist of digits only
 *   Neither has leading zeros, except the number 0 itself
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function multiply(num1: string, num2: string): string {
  // TODO: implement
  throw new Error("Not implemented");
}

test("43. Multiply Strings", () => {
  assert.equal(multiply("2", "3"), "6");
  assert.equal(multiply("123", "456"), "56088");
  assert.equal(multiply("0", "9999"), "0");
  assert.equal(multiply("999", "999"), "998001");
  assert.equal(
    multiply("123456789123456789", "987654321987654321"),
    (123456789123456789n * 987654321987654321n).toString(),
  );
});
