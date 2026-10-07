/**
 * 332. Reconstruct Itinerary
 * Difficulty: Hard
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/reconstruct-itinerary/
 *
 * Given a list of airline `tickets` where tickets[i] = [from, to], rebuild
 * the itinerary in order. All tickets belong to someone departing from
 * "JFK", so the itinerary must start there. Every ticket must be used
 * exactly once. If several valid itineraries exist, return the one that is
 * lexicographically smallest when read as a single string. At least one
 * valid itinerary is guaranteed.
 *
 * Example 1:
 *   Input: tickets = [["MUC","LHR"],["JFK","MUC"],["SFO","SJC"],["LHR","SFO"]]
 *   Output: ["JFK","MUC","LHR","SFO","SJC"]
 *
 * Example 2:
 *   Input: tickets = [["JFK","SFO"],["JFK","ATL"],["SFO","ATL"],["ATL","JFK"],["ATL","SFO"]]
 *   Output: ["JFK","ATL","JFK","SFO","ATL","SFO"]
 *
 * Constraints:
 *   1 <= tickets.length <= 300
 *   from and to are 3 uppercase letters, from != to
 *
 * Approach: Hierholzer's algorithm (Eulerian path)
 *   Sort each airport's destinations so we always try the smallest first.
 *   DFS: repeatedly consume the smallest outgoing ticket; when an airport
 *   has no tickets left, append it to the route (post-order). The reversed
 *   post-order is the itinerary. Dead ends naturally end up last.
 *
 * Time: O(E log E)   Space: O(E)
 *
 * Pattern: graph-dfs
 * Key insight: Using every ticket exactly once is an Eulerian path. Greedily taking the
 *   smallest destination can hit a dead end early, but adding an airport to the route
 *   only after its tickets are used up pushes dead ends to the end, so the reversed
 *   post-order is always valid.
 * Real world: Route planners for snowplows, mail delivery or PCB drilling that must
 *   traverse every street or edge exactly once (Chinese postman / Eulerian circuits).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule route holds airports with no unused tickets left, in reverse trip order
// @why Returns the trip that uses every ticket once and is the smallest in alphabet order.
export function findItinerary(tickets: string[][]): string[] {
  // @why For each airport, the list of places you can fly to next.
  const adj = new Map<string, string[]>();
  // Sort descending so pop() yields the lexicographically smallest.
  // @why Sort destinations from biggest to smallest, so `pop()` gives the smallest first.
  const sorted = [...tickets].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  // @why Add each ticket as an edge from its start airport to its end.
  for (const [from, to] of sorted) {
    // @why See if this airport already has a list.
    const list = adj.get(from);
    // @why If so, add the new destination to it.
    if (list) list.push(to);
    // @why Otherwise start a new list.
    else adj.set(from, [to]);
  }

  // @why The trip, filled in backwards as we finish airports.
  const route: string[] = [];
  // @why Visit an airport by using its tickets one at a time.
  const dfs = (airport: string): void => {
    // @why The tickets still unused from here.
    const dests = adj.get(airport); // @ask dests?.length
    // @why Take the smallest unused ticket and follow it; each ticket is used only once because of `pop()`.
    while (dests && dests.length) dfs(dests.pop()!);
    // @why Add the airport only after it has no tickets left (stuck airports end up last in the trip).
    route.push(airport); // @moment stuck at {airport}, add to route
  };

  // @why The trip must start at JFK.
  dfs("JFK");
  // @why We built the trip backwards, so flip it.
  return route.reverse();
}

test("332. Reconstruct Itinerary", () => {
  assert.deepEqual(
    findItinerary([["MUC", "LHR"], ["JFK", "MUC"], ["SFO", "SJC"], ["LHR", "SFO"]]),
    ["JFK", "MUC", "LHR", "SFO", "SJC"],
  );
  assert.deepEqual(
    findItinerary([["JFK", "SFO"], ["JFK", "ATL"], ["SFO", "ATL"], ["ATL", "JFK"], ["ATL", "SFO"]]),
    ["JFK", "ATL", "JFK", "SFO", "ATL", "SFO"],
  );
  // Smallest-first greedy would hit a dead end at KUL.
  assert.deepEqual(
    findItinerary([["JFK", "KUL"], ["JFK", "NRT"], ["NRT", "JFK"]]),
    ["JFK", "NRT", "JFK", "KUL"],
  );
});
