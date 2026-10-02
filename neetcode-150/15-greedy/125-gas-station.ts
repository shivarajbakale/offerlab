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
 *
 * Approach: Greedy single pass
 *   If total gas < total cost, no start works. Otherwise a start exists.
 *   Walk the stations keeping a running tank; whenever it drops below zero,
 *   no station from the current start up to here can be the answer, so reset
 *   the tank and try the next station as the start.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: greedy
 * Key insight: If the tank goes negative between start and i, every station in that
 *   stretch also fails (it would arrive with no more fuel than start did), so jump the
 *   start to i + 1. If total gas covers total cost, the surviving start works.
 * Real world: A delivery route planner choosing which depot on a circular route to start
 *   from so a vehicle with charging stops never runs its battery empty.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canCompleteCircuit(gas: number[], cost: number[]): number {
  let total = 0;
  let tank = 0;
  let start = 0;
  for (let i = 0; i < gas.length; i++) {
    const diff = gas[i] - cost[i];
    total += diff;
    tank += diff;
    if (tank < 0) {
      tank = 0;
      start = i + 1;
    }
  }
  return total < 0 ? -1 : start;
}

test("134. Gas Station", () => {
  assert.equal(canCompleteCircuit([1, 2, 3, 4, 5], [3, 4, 5, 1, 2]), 3);
  assert.equal(canCompleteCircuit([2, 3, 4], [3, 4, 3]), -1);
  assert.equal(canCompleteCircuit([5], [4]), 0); // single station
});
