/**
 * 134. Gas Station
 * Difficulty: Medium
 * Category: Greedy
 * LeetCode: https://leetcode.com/problems/gas-station/
 *
 * There are n gas stations on a circular route. Station i provides gas[i]
 * units of fuel, and driving from station i to station i + 1 costs cost[i].
 * Starting with an empty tank, return the index of the station from which
 * you can travel around the circuit once clockwise, or -1 if impossible.
 * If a solution exists, it is guaranteed to be unique.
 *
 * Example 1:
 *   Input: gas = [1, 2, 3, 4, 5], cost = [3, 4, 5, 1, 2]
 *   Output: 3
 *
 * Example 2:
 *   Input: gas = [2, 3, 4], cost = [3, 4, 3]
 *   Output: -1
 *
 * Constraints:
 *   n == gas.length == cost.length
 *   1 <= n <= 10^5
 *   0 <= gas[i], cost[i] <= 10^4
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canCompleteCircuit(gas: number[], cost: number[]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("134. Gas Station", () => {
  assert.equal(canCompleteCircuit([1, 2, 3, 4, 5], [3, 4, 5, 1, 2]), 3);
  assert.equal(canCompleteCircuit([2, 3, 4], [3, 4, 3]), -1);
  assert.equal(canCompleteCircuit([5], [4]), 0); // single station
});
