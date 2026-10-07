/**
 * 1046. Last Stone Weight
 * Difficulty: Easy
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/last-stone-weight/
 *
 * You are given an array `stones` of positive integer weights. Each turn,
 * take the two heaviest stones x <= y and smash them together: if x == y
 * both are destroyed, otherwise x is destroyed and y becomes y - x.
 * Repeat until at most one stone remains. Return the weight of the last
 * stone, or 0 if none remain.
 *
 * Example 1:
 *   Input: stones = [2, 7, 4, 1, 8, 1]
 *   Output: 1
 *
 * Example 2:
 *   Input: stones = [1]
 *   Output: 1
 *
 * Constraints:
 *   1 <= stones.length <= 30
 *   1 <= stones[i] <= 1000
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function lastStoneWeight(stones: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("1046. Last Stone Weight", () => {
  assert.equal(lastStoneWeight([2, 7, 4, 1, 8, 1]), 1);
  assert.equal(lastStoneWeight([1]), 1);
  assert.equal(lastStoneWeight([3, 3]), 0);
});
