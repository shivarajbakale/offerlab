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

// @why Returns how many separate connected groups the graph has.
export function countComponents(n: number, edges: number[][]): number {
  // @why Each node starts as its own group leader.
  const parent = Array.from({ length: n }, (_, i) => i);
  // @why Size of each group, used to attach the smaller group to the bigger one.
  const rank = new Array<number>(n).fill(1);

  // @why Finds the leader of a node's group.
  const find = (x: number): number => {
    // @why Keep climbing until we reach a node that is its own leader.
    while (x !== parent[x]) {
      // @why Shortcut to the grandparent so later lookups are faster.
      parent[x] = parent[parent[x]];
      // @why Move up one step.
      x = parent[x];
    }
    // @why The group leader.
    return x;
  };

  // @why Start with every node alone; each merge will lower this by one.
  let components = n;
  // @why Each edge may join two groups.
  for (const [a, b] of edges) {
    // @why Leader of the first node.
    let ra = find(a);
    // @why Leader of the second node.
    let rb = find(b);
    // @why Already in the same group, so this edge changes nothing.
    if (ra === rb) continue;
    // @why Make `ra` the bigger group so the tree stays shallow.
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    // @why Hang the smaller group under the bigger one.
    parent[rb] = ra;
    // @why The merged group is now bigger.
    rank[ra] += rank[rb];
    // @why Two groups became one.
    components--;
  }
  // @why Groups left after all edges are used.
  return components;
}

test("323. Number of Connected Components in an Undirected Graph", () => {
  assert.equal(countComponents(5, [[0, 1], [1, 2], [3, 4]]), 2);
  assert.equal(countComponents(5, [[0, 1], [1, 2], [2, 3], [3, 4]]), 1);
  assert.equal(countComponents(3, []), 3);
  assert.equal(countComponents(4, [[0, 1], [1, 2], [2, 0]]), 2);
});
