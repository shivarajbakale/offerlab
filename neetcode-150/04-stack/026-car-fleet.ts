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
 *
 * Approach: Sort by position, stack of arrival times
 *   Process cars from closest to the target to farthest. Compute each car's
 *   time to reach the target. If it would arrive no later than the fleet
 *   ahead (top of stack), it merges into that fleet; otherwise it forms a new
 *   fleet and is pushed.
 *
 * Time: O(n log n)   Space: O(n)
 *
 * Pattern: monotonic-stack
 * Key insight: Processing cars from closest to the target, a car that would arrive no
 *   later than the fleet ahead gets blocked and joins it, so only cars with a strictly
 *   later arrival time start new fleets.
 * Real world: Traffic simulation merging vehicles into platoons on a single lane where
 *   faster cars catch up and are stuck behind slower ones.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule stack holds fleet arrival times, each strictly later than the fleet ahead of it
// @why Count the groups (fleets) of cars that arrive at the target together.
// @goal how many fleets reach {target}, with cars at {JSON.stringify(position)} driving at {JSON.stringify(speed)}?
export function carFleet(target: number, position: number[], speed: number[]): number {
  // @why Pair each car's position with its speed so they can be sorted together.
  // @phase Setup: line the cars up from the front
  // @say Simulating the cars hour by hour, tracking who catches whom, is slow and fiddly. But cars can't pass, so a car only ever merges with the fleet right ahead of it. Sort front to back and compare each car's solo arrival time with that fleet's.
  const cars = position
    .map((p, i) => [p, speed[i]] as const)
    // @why Sort from closest to the target to farthest; a car can only be blocked by one ahead of it.
    .sort((a, b) => b[0] - a[0]);

  // @why Arrival times of fleets, in order from front to back.
  const stack: number[] = []; // arrival times of fleets
  // @why Go through cars from front to back.
  // @phase Front to back: join the fleet ahead, or lead a new one
  // @say Car at {p} driving {s}.
  for (const [p, s] of cars) {
    // @why How long this car needs to reach the target if nothing blocks it.
    // @say Alone it would arrive after ({target} − {p}) ÷ {s} = {(target - p) / s} {(target - p) / s === 1 ? "hour" : "hours"}.
    const time = (target - p) / s; // @ask time
    // @why Slower than the fleet ahead means it catches up and joins it. Taking longer starts a new fleet.
    // @yes {stack.length === 0 ? "No car is ahead, so this car leads the first fleet." : "It needs " + time + (time === 1 ? " hour" : " hours") + ", longer than the fleet ahead (" + stack[stack.length - 1] + "). It never catches up, so it leads a new fleet."}
    // @no It needs only {time} {time === 1 ? "hour" : "hours"}, no more than the fleet ahead ({stack[stack.length - 1]}), so it catches up before the target. It can't pass, so it slows down and joins that fleet.
    // @then {stack.length} {stack.length === 1 ? "fleet" : "fleets"} so far; the last one arrives at {stack[stack.length - 1]} {stack[stack.length - 1] === 1 ? "hour" : "hours"}.
    if (stack.length === 0 || time > stack[stack.length - 1]) stack.push(time); // @ask stack.length // @moment car at {p} needs {time} hours
  }
  // @why Each entry left is one fleet.
  // @phase Answer
  // @returns {stack.length}: one fleet per car that couldn't catch the fleet ahead of it.
  return stack.length;
}

test("853. Car Fleet", () => {
  assert.equal(carFleet(12, [10, 8, 0, 5, 3], [2, 4, 1, 1, 3]), 3);
  assert.equal(carFleet(10, [3], [3]), 1);
  assert.equal(carFleet(100, [0, 2, 4], [4, 2, 1]), 1);
  assert.equal(carFleet(10, [0, 4, 2], [2, 1, 3]), 1);
  assert.equal(carFleet(10, [6, 8], [3, 2]), 2);
});
