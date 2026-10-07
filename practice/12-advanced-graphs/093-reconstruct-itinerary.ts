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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findItinerary(tickets: string[][]): string[] {
  // TODO: implement
  throw new Error("Not implemented");
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
