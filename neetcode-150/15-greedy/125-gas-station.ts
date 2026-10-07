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

// @rule tank, the gas left driving from start up to i, never stays below 0
// @why Returns the start station index that completes the loop, or -1 if none does.
// @goal which station lets you drive the whole loop with gas {JSON.stringify(gas)} and costs {JSON.stringify(cost)}?
export function canCompleteCircuit(gas: number[], cost: number[]): number {
  // @why `total` is the net gas over the whole loop; if it is negative, no start can work.
  // @phase Setup: one balance for the whole loop, one for the current try
  // @say Simulating the loop from every station is n² work. But if a start runs dry at station i, every station between it and i would run dry by then too, since each arrived there with a non-negative tank. So one pass can skip straight past them.
  let total = 0;
  // @why `tank` is the gas we would have if we began at `start` and drove up to here.
  let tank = 0;
  // @why The current candidate for the starting station.
  let start = 0;
  // @why Visit every station once.
  // @phase One pass: drive from the current start until the tank goes negative
  // @yes Station {i} is next, {i === start ? "trying it as a fresh start" : "driving on from start " + start}.
  // @no Every station has been visited once. The last start never ran dry on the way to the end of the array.
  for (let i = 0; i < gas.length; i++) {
    // @why Gas gained at this station minus the gas spent driving to the next one.
    // @say At station {i}: fill {gas[i]}, spend {cost[i]} to reach the next one, so the tank changes by {gas[i] - cost[i]}.
    const diff = gas[i] - cost[i];
    // @why Add to the overall balance for the final feasibility check.
    // @say Whole-loop balance: {total} + {diff} = {total + diff}. Whatever the start, the loop is possible only if this ends up 0 or more.
    total += diff;
    // @why Add to the tank for the current candidate start.
    // @say Tank since start {start}: {tank} + {diff} = {tank + diff}.
    tank += diff; // @ask tank
    // @why A negative tank means we ran dry, so this start and every start before it fails.
    // @yes The tank is {tank}: starting at {start}, you can't get past station {i}.{i > start ? " Any start from " + (start + 1) + " to " + i + " would reach this leg with even less, since the stretch before it only added gas, so all of them fail." : ""}
    // @no The tank is {tank}, still 0 or more, so start {start} survives the leg past station {i}.
    if (tank < 0) { // @broken
      // @why Reset the tank because the new candidate starts empty.
      // @say Start over with an empty tank.
      tank = 0;
      // @why Try the very next station as the new start.
      // @say The earliest start not ruled out is the next station, {i + 1}.
      start = i + 1; // @ask start // @moment ran dry at {i}, try {i+1}
    }
  }
  // @why If total gas is enough, the last candidate must work; if not, it is impossible.
  // @phase Answer
  // @returns {total < 0 ? "-1: the loop needs " + (-total) + " more gas than the stations hold, so no start can finish." : start + ": the stations hold enough gas overall (balance " + total + "), and " + start + " reaches the end of the array without running dry, so the surplus it carries covers the wrap-around stretch before it."}
  return total < 0 ? -1 : start;
}

test("134. Gas Station", () => {
  assert.equal(canCompleteCircuit([1, 2, 3, 4, 5], [3, 4, 5, 1, 2]), 3);
  assert.equal(canCompleteCircuit([2, 3, 4], [3, 4, 3]), -1);
  assert.equal(canCompleteCircuit([5], [4]), 0); // single station
});
