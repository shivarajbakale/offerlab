/**
 * 787. Cheapest Flights Within K Stops
 * Difficulty: Medium
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/cheapest-flights-within-k-stops/
 *
 * There are `n` cities labeled 0..n-1 connected by directed `flights`, where
 * flights[i] = [from, to, price]. Given `src`, `dst` and `k`, return the
 * cheapest price from src to dst using at most k stops (i.e. at most k + 1
 * flights). Return -1 if no such route exists.
 *
 * Example 1:
 *   Input: n = 4, flights = [[0,1,100],[1,2,100],[2,0,100],[1,3,600],[2,3,200]],
 *          src = 0, dst = 3, k = 1
 *   Output: 700
 *   Explanation: 0 -> 1 -> 3 costs 700; 0 -> 1 -> 2 -> 3 is cheaper but
 *                uses 2 stops.
 *
 * Example 2:
 *   Input: n = 3, flights = [[0,1,100],[1,2,100],[0,2,500]], src = 0, dst = 2, k = 1
 *   Output: 200
 *
 * Example 3:
 *   Input: n = 3, flights = [[0,1,100],[1,2,100],[0,2,500]], src = 0, dst = 2, k = 0
 *   Output: 500
 *
 * Constraints:
 *   1 <= n <= 100
 *   0 <= flights.length <= n * (n - 1) / 2
 *   1 <= price <= 10^4, no duplicate flights
 *   0 <= src, dst, k < n, src != dst
 *
 * Approach: Bellman-Ford limited to k + 1 rounds
 *   Keep a `prices` array (Infinity except src = 0). Each round relaxes every
 *   edge once, reading from the previous round's copy so a single round can
 *   only extend paths by one flight. After k + 1 rounds, prices[dst] holds
 *   the cheapest cost using at most k + 1 flights.
 *
 * Time: O(k * E)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findCheapestPrice(
  n: number,
  flights: number[][],
  src: number,
  dst: number,
  k: number,
): number {
  let prices = new Array<number>(n).fill(Infinity);
  prices[src] = 0;

  for (let i = 0; i <= k; i++) {
    const next = [...prices];
    for (const [from, to, price] of flights) {
      if (prices[from] === Infinity) continue;
      if (prices[from] + price < next[to]) next[to] = prices[from] + price;
    }
    prices = next;
  }
  return prices[dst] === Infinity ? -1 : prices[dst];
}

test("787. Cheapest Flights Within K Stops", () => {
  assert.equal(
    findCheapestPrice(4, [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]], 0, 3, 1),
    700,
  );
  assert.equal(findCheapestPrice(3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 1), 200);
  assert.equal(findCheapestPrice(3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 0), 500);
  assert.equal(findCheapestPrice(3, [[0, 1, 100]], 0, 2, 1), -1);
});
