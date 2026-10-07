/**
 * 323. Number of Connected Components in an Undirected Graph (Premium; LintCode 3651)
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/
 *
 * There is an undirected graph with `n` nodes labeled 0..n-1, and an array
 * `edges` where edges[i] = [a, b] is an edge between a and b. Return the
 * number of connected components in the graph.
 *
 * Example 1:
 *   Input: n = 5, edges = [[0,1],[1,2],[3,4]]
 *   Output: 2
 *
 * Example 2:
 *   Input: n = 5, edges = [[0,1],[1,2],[2,3],[3,4]]
 *   Output: 1
 *
 * Constraints:
 *   1 <= n <= 2000
 *   1 <= edges.length <= 5000
 *   0 <= a, b < n, a != b, no repeated edges
 *
 * Approach: Union-Find
 *   Start with n components. Every union that actually merges two different
 *   roots reduces the component count by one.
 *
 * Time: O(n + E * α(n))   Space: O(n)
 *
 * Pattern: union-find
 * Key insight: Every successful union merges two components into one, so the answer is n
 *   minus the number of unions that actually merged. No traversal or adjacency list is
 *   needed.
 * Real world: Counting clusters of users linked by shared devices or payment cards in
 *   fraud detection, adding links one at a time as they are observed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule components equals the number of nodes that are their own root in parent
// @why Returns how many separate connected groups the graph has.
// @goal how many separate groups do {n} nodes form, joined by edges {JSON.stringify(edges)}?
export function countComponents(n: number, edges: number[][]): number {
  // @why Each node starts as its own group leader.
  // @phase Setup: every node alone, n groups
  // @say You could build an adjacency list and flood-fill each group. Union-find needs neither: start with {n} groups of one, and every edge that joins two different groups lowers the count by exactly one.
  const parent = Array.from({ length: n }, (_, i) => i);
  // @why Size of each group, used to attach the smaller group to the bigger one.
  const rank = new Array<number>(n).fill(1);

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
      parent[x] = parent[parent[x]];
      // @why Move up one step.
      // @say Climb to {parent[x]}.
      x = parent[x];
    }
    // @why The group leader.
    // @returns {x}, the leader. Two nodes are in the same group exactly when their leaders match.
    return x;
  };

  // @why Start with every node alone; each merge will lower this by one.
  // @phase Each edge: merge two groups, or change nothing
  let components = n;
  // @why Each edge may join two groups.
  // @say Take the edges one at a time. Each one either merges two groups or lands inside one.
  for (const [a, b] of edges) {
    // @why Leader of the first node.
    // @say Edge {a}–{b}: does it join two separate groups? First, which group is {a} in?
    // @then {a} is led by {ra}.
    let ra = find(a);
    // @why Leader of the second node.
    // @say Which group is {b} in?
    // @then {b} is led by {rb}.
    let rb = find(b);
    // @why Already in the same group, so this edge changes nothing.
    // @yes {a} and {b} both lead to {ra}: already one group. This edge adds a second path inside it, so the count stays {components}.
    // @no Leaders {ra} and {rb} differ: this edge joins two separate groups into one.
    if (ra === rb) continue;
    // @why Make `ra` the bigger group so the tree stays shallow.
    // @yes Group {rb} ({rank[rb]} nodes) is bigger than group {ra} ({rank[ra]}). Swap them so the smaller one gets hung under the bigger one.
    // @no Group {ra} ({rank[ra]} {rank[ra] === 1 ? "node" : "nodes"}) is at least as big as group {rb} ({rank[rb]}), so hang {rb} under it. Hanging small under big keeps the climbs in find short.
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    // @why Hang the smaller group under the bigger one.
    // @say Point leader {rb} at {ra}. Every node in {rb}'s group now finds {ra} as its leader.
    parent[rb] = ra; // @ask parent[rb]
    // @why The merged group is now bigger.
    // @say Group {ra} now has {rank[ra]} + {rank[rb]} = {rank[ra] + rank[rb]} nodes.
    rank[ra] += rank[rb];
    // @why Two groups became one.
    // @say Two groups became one: {components} → {components - 1}.
    components--; // @ask components // @moment merge {a} and {b}
  }
  // @why Groups left after all edges are used.
  // @phase Answer
  // @returns {components}: {n} nodes minus one for each edge that merged two groups.
  return components;
}

test("323. Number of Connected Components in an Undirected Graph", () => {
  assert.equal(countComponents(5, [[0, 1], [1, 2], [3, 4]]), 2);
  assert.equal(countComponents(5, [[0, 1], [1, 2], [2, 3], [3, 4]]), 1);
  assert.equal(countComponents(3, []), 3);
  assert.equal(countComponents(4, [[0, 1], [1, 2], [2, 0]]), 2);
});
