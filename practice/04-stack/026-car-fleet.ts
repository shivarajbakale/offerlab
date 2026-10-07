/**
 * 853. Car Fleet
 * Difficulty: Medium
 * Category: Stack
 * LeetCode: https://leetcode.com/problems/car-fleet/
 *
 * There are n cars heading to the same destination `target` on a one-lane
 * road. Car i starts at position[i] and drives at speed[i]. A car can never
 * pass another; if it catches up, it slows down and they move together as a
 * fleet. A car catching a fleet exactly at the target joins that fleet.
 * Return the number of car fleets that arrive at the destination.
 *
 * Example 1:
 *   Input: target = 12, position = [10, 8, 0, 5, 3], speed = [2, 4, 1, 1, 3]
 *   Output: 3
 *
 * Example 2:
 *   Input: target = 10, position = [3], speed = [3]
 *   Output: 1
 *
 * Example 3:
 *   Input: target = 100, position = [0, 2, 4], speed = [4, 2, 1]
 *   Output: 1
 *
 * Constraints:
 *   1 <= n <= 10^5
 *   0 < target <= 10^6
 *   0 <= position[i] < target, all positions are unique
 *   0 < speed[i] <= 10^6
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function carFleet(target: number, position: number[], speed: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("853. Car Fleet", () => {
  assert.equal(carFleet(12, [10, 8, 0, 5, 3], [2, 4, 1, 1, 3]), 3);
  assert.equal(carFleet(10, [3], [3]), 1);
  assert.equal(carFleet(100, [0, 2, 4], [4, 2, 1]), 1);
  assert.equal(carFleet(10, [0, 4, 2], [2, 1, 3]), 1);
  assert.equal(carFleet(10, [6, 8], [3, 2]), 2);
});
