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
 *
 * Pattern: shortest-path
 * Key insight: Dijkstra's greedy pick ignores the stop limit, but Bellman-Ford's i-th
 *   round finds the cheapest path using at most i flights. Reading from the previous
 *   round's copy stops one round from chaining two flights, so k + 1 rounds enforce the
 *   limit exactly.
 * Real world: Flight search engines finding the cheapest fare with at most k connections,
 *   where a cheaper route with too many stops must be rejected.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule after round i, next[x] is the cheapest cost to x using at most i + 1 flights
// @why Returns the cheapest price from `src` to `dst` with at most `k` stops, or -1.
export function findCheapestPrice(
  n: number,
  flights: number[][],
  src: number,
  dst: number,
  k: number,
): number {
  // @why `prices[x]` is the cheapest known cost to reach city `x`; unknown is Infinity.
  let prices = new Array<number>(n).fill(Infinity);
  // @why Getting to the start costs nothing.
  prices[src] = 0;

  // @why `k` stops means at most `k + 1` flights, so run one round per flight.
  for (let i = 0; i <= k; i++) {
    // @why Update a copy, so each round adds only one more flight.
    const next = [...prices];
    // @why Look at every flight.
    for (const [from, to, price] of flights) {
      // @why Skip it if we can't reach its starting city yet.
      if (prices[from] === Infinity) continue;
      // @why Keep the cheaper of the old price and the price using this flight.
      if (prices[from] + price < next[to]) next[to] = prices[from] + price; // @ask next[to]
    }
    // @why The new round's prices become the current ones.
    prices = next; // @moment round {i + 1}: {next.join(",")}
  }
  // @why If the destination was never reached, return -1.
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
