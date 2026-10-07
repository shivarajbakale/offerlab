/**
 * 743. Network Delay Time
 * Difficulty: Medium
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/network-delay-time/
 *
 * There are `n` network nodes labeled 1..n and a list of directed travel
 * times `times[i] = [u, v, w]` meaning a signal takes w time to go from u to
 * v. A signal is sent from node `k`. Return the minimum time for all n nodes
 * to receive it, or -1 if some node can never receive it.
 *
 * Example 1:
 *   Input: times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2
 *   Output: 2
 *
 * Example 2:
 *   Input: times = [[1,2,1]], n = 2, k = 1
 *   Output: 1
 *
 * Example 3:
 *   Input: times = [[1,2,1]], n = 2, k = 2
 *   Output: -1
 *
 * Constraints:
 *   1 <= k <= n <= 100
 *   1 <= times.length <= 6000
 *   0 <= w <= 100, all (u, v) pairs unique
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function networkDelayTime(times: number[][], n: number, k: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("743. Network Delay Time", () => {
  assert.equal(networkDelayTime([[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2), 2);
  assert.equal(networkDelayTime([[1, 2, 1]], 2, 1), 1);
  assert.equal(networkDelayTime([[1, 2, 1]], 2, 2), -1);
  // Indirect path is shorter than the direct edge.
  assert.equal(networkDelayTime([[1, 2, 10], [1, 3, 1], [3, 2, 1]], 3, 1), 2);
});
