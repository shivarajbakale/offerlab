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
// @goal which order of airports uses all {tickets.length} tickets exactly once, starting at JFK, and comes first alphabetically?
export function findItinerary(tickets: string[][]): string[] {
  // @why For each airport, the list of places you can fly to next.
  // @phase Setup: a ticket list per airport, smallest destination last
  // @say Trying every order of tickets and keeping the valid ones is factorial work. Instead, always fly the smallest unused ticket, and write an airport down only once it has no tickets left. That fixes dead ends without backtracking.
  const adj = new Map<string, string[]>();
  // Sort descending so pop() yields the lexicographically smallest.
  // @why Sort destinations from biggest to smallest, so `pop()` gives the smallest first.
  const sorted = [...tickets].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  // @why Add each ticket as an edge from its start airport to its end.
  // @say Ticket {from} → {to}.
  for (const [from, to] of sorted) {
    // @why See if this airport already has a list.
    const list = adj.get(from);
    // @why If so, add the new destination to it.
    // @yes {from} already has tickets {JSON.stringify(list)}. Tickets arrive largest destination first, so {to} goes on the end, nearer the pop side.
    // @no No ticket out of {from} has been seen yet, so there is no list to add to.
    if (list) list.push(to);
    // @why Otherwise start a new list.
    // @say Start {from}'s list with {to}.
    else adj.set(from, [to]);
  }

  // @why The trip, filled in backwards as we finish airports.
  const route: string[] = [];
  // @why Visit an airport by using its tickets one at a time.
  // @goal standing at {airport}, which tickets can you use up from here before getting stuck?
  const dfs = (airport: string): void => {
    // @why The tickets still unused from here.
    // @phase Fly the smallest ticket until stuck, then write the airport down
    // @say Land at {airport}. Unused tickets out of it: {adj.has(airport) && adj.get(airport).length ? JSON.stringify(adj.get(airport)) : "none"}.
    const dests = adj.get(airport); // @ask dests?.length
    // @why Take the smallest unused ticket and follow it; each ticket is used only once because of `pop()`.
    // @yes {airport} still has {dests.length === 1 ? "a ticket" : dests.length + " tickets"} left. Fly the smallest, to {dests[dests.length - 1]}, and burn it so it is never used twice.
    // @no {airport} has no tickets left. Any trip that reaches here has to end here, so it is safe to write down.
    while (dests && dests.length) dfs(dests.pop()!);
    // @why Add the airport only after it has no tickets left (stuck airports end up last in the trip).
    // @say Write {airport} down: the route becomes {JSON.stringify(route.concat([airport]))}. Everything after it in the real trip is already there, because the route is built from the end backwards.
    route.push(airport); // @moment stuck at {airport}, add to route
  };

  // @why The trip must start at JFK.
  // @phase Run the walk from JFK
  // @say Start at JFK. When this returns, every ticket has been used and the route holds the trip in reverse.
  dfs("JFK");
  // @why We built the trip backwards, so flip it.
  // @phase Answer
  // @returns {JSON.stringify(route)}: the route flipped into trip order. Each ticket was flown exactly once, so the sort dominates: O(E log E).
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
