/**
 * 684. Redundant Connection
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/redundant-connection/
 *
 * A tree with n nodes labeled 1..n had one extra edge added, connecting two
 * different existing nodes. Given the resulting `edges` array (length n),
 * return an edge that can be removed so the graph becomes a tree again. If
 * there are multiple answers, return the one that appears last in `edges`.
 *
 * Example 1:
 *   Input: edges = [[1,2],[1,3],[2,3]]
 *   Output: [2,3]
 *
 * Example 2:
 *   Input: edges = [[1,2],[2,3],[3,4],[1,4],[1,5]]
 *   Output: [1,4]
 *
 * Constraints:
 *   3 <= n <= 1000
 *   edges[i].length == 2, 1 <= a < b <= n
 *   No repeated edges; the graph is connected
 *
 * Approach: Union-Find
 *   Process edges in order, unioning their endpoints. The first edge whose
 *   endpoints already share a root closes a cycle - that is the answer (and
 *   it is the last cycle edge in input order, since earlier ones merged).
 *   Path compression + union by rank keep operations near O(1).
 *
 * Time: O(n * α(n))   Space: O(n)
 *
 * Pattern: union-find
 * Key insight: Union-find answers "are a and b already connected?" in near-constant time.
 *   The first edge whose endpoints share a root closes the cycle, and since this is the
 *   only extra edge, it is the answer.
 * Real world: Network design tools spotting a redundant cable or loop in a topology as
 *   links are added, which matters for protocols like Spanning Tree that must break
 *   loops.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule each edge so far joined two different groups, so the edges seen form no cycle
// @why Returns the edge that closes a cycle, found with union-find.
// @goal which edge of {JSON.stringify(edges)} can be removed to leave a tree?
export function findRedundantConnection(edges: number[][]): number[] {
  // @why A tree with n nodes has n - 1 edges, so this input has exactly one extra edge.
  // @phase Setup: every node starts as its own group
  // @say For each edge you could search the graph built so far to ask "are these two already connected?", which is O(n) per edge. Union-find keeps groups of connected nodes, so that question is one leader lookup: if both ends already share a leader, the edge closes a cycle.
  const n = edges.length;
  // @why Each node starts as its own group leader.
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  // @why Size of each group, used to attach the smaller group to the bigger one.
  const rank = new Array<number>(n + 1).fill(1);

  // @why Finds the leader of a node's group.
  // @phase Find a group's leader
  // @goal which node leads the group that {x} belongs to?
  const find = (x: number): number => {
    // @why Keep climbing until we reach a node that is its own leader.
    // @yes {x} points to {parent[x]}, not to itself, so it is not the leader. Climb.
    // @no {x} points to itself, so it is the leader of its group.
    while (x !== parent[x]) {
      // @why Shortcut to the grandparent so later lookups are faster.
      // @say {parent[parent[x]] === parent[x] ? "Path halving: point " + x + " at its grandparent. Here that is " + parent[x] + " itself, the leader, so nothing changes." : "Shortcut: point " + x + " at its grandparent " + parent[parent[x]] + ", skipping " + parent[x] + ". Later lookups from " + x + " climb half as far."}
      parent[x] = parent[parent[x]]; // path halving
      // @why Move up one step.
      // @say Climb to {parent[x]}.
      x = parent[x];
    }
    // @why The group leader.
    // @returns {x}, the leader. Two nodes are connected exactly when their leaders match.
    return x;
  };

  // @why Joins two groups; returns false if they were already joined.
  // @phase Join two groups, or catch the edge that closes a cycle
  // @goal can edge {a}–{b} be added without closing a cycle?
  const union = (a: number, b: number): boolean => {
    // @why Leader of the first node.
    // @say Which group is {a} in?
    // @then {a} is led by {ra}.
    let ra = find(a);
    // @why Leader of the second node.
    // @say Which group is {b} in?
    // @then {b} is led by {rb}.
    let rb = find(b);
    // @why Same leader means they are already connected, so this edge makes a cycle.
    // @yes {a} and {b} both lead to {ra}: a path between them already exists. Adding {a}–{b} gives a second path, which closes a cycle.
    // @no Leaders {ra} and {rb} differ, so {a} and {b} are not connected yet. This edge joins two separate groups and can't close a cycle.
    // @returns false: edge {a}–{b} is the extra one.
    if (ra === rb) return false; // @broken
    // @why Make `ra` the bigger group so the tree stays shallow.
    // @yes Group {rb} ({rank[rb]} nodes) is bigger than group {ra} ({rank[ra]}). Swap them so the smaller one gets hung under the bigger one.
    // @no Group {ra} ({rank[ra]} {rank[ra] === 1 ? "node" : "nodes"}) is at least as big as group {rb} ({rank[rb]}), so hang {rb} under it. Hanging small under big keeps the climbs in find short.
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    // @why Hang the smaller group under the bigger one.
    // @say Point leader {rb} at {ra}. Every node in {rb}'s group now finds {ra} as its leader.
    parent[rb] = ra; // @ask parent[rb] // @moment join group {rb} under {ra}
    // @why The merged group is now bigger.
    // @say Group {ra} now has {rank[ra]} + {rank[rb]} = {rank[ra] + rank[rb]} nodes.
    rank[ra] += rank[rb]; // @ask rank[ra]
    // @why The edge joined two separate groups, so it is fine.
    // @returns true: edge {a}–{b} joined two groups and closes no cycle.
    return true;
  };

  // @why Add edges in order; the first one that fails is the answer.
  // @phase Add the edges in order
  // @say Add edge {a}–{b}. The only extra edge is the one that closes the cycle, and every edge before it joined two separate groups.
  // @returns [{a}, {b}]: both ends were already connected when it arrived, so it is the one edge that closes the cycle.
  for (const [a, b] of edges) if (!union(a, b)) return [a, b];
  // @why Not reached for valid input, but keeps the return type happy.
  // @returns []: no edge closed a cycle. The problem promises one, so this only happens on bad input.
  return [];
}

test("684. Redundant Connection", () => {
  assert.deepEqual(findRedundantConnection([[1, 2], [1, 3], [2, 3]]), [2, 3]);
  assert.deepEqual(findRedundantConnection([[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]), [1, 4]);
  assert.deepEqual(findRedundantConnection([[3, 4], [1, 2], [2, 4], [3, 5], [2, 5]]), [2, 5]);
});
