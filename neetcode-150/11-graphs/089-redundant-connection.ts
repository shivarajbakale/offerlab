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

// @why Returns the edge that closes a cycle, found with union-find.
export function findRedundantConnection(edges: number[][]): number[] {
  // @why A tree with n nodes has n - 1 edges, so this input has exactly one extra edge.
  const n = edges.length;
  // @why Each node starts as its own group leader.
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  // @why Size of each group, used to attach the smaller group to the bigger one.
  const rank = new Array<number>(n + 1).fill(1);

  // @why Finds the leader of a node's group.
  const find = (x: number): number => {
    // @why Keep climbing until we reach a node that is its own leader.
    while (x !== parent[x]) {
      // @why Shortcut to the grandparent so later lookups are faster.
      parent[x] = parent[parent[x]]; // path halving
      // @why Move up one step.
      x = parent[x];
    }
    // @why The group leader.
    return x;
  };

  // @why Joins two groups; returns false if they were already joined.
  const union = (a: number, b: number): boolean => {
    // @why Leader of the first node.
    let ra = find(a);
    // @why Leader of the second node.
    let rb = find(b);
    // @why Same leader means they are already connected, so this edge makes a cycle.
    if (ra === rb) return false;
    // @why Make `ra` the bigger group so the tree stays shallow.
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    // @why Hang the smaller group under the bigger one.
    parent[rb] = ra;
    // @why The merged group is now bigger.
    rank[ra] += rank[rb];
    // @why The edge joined two separate groups, so it is fine.
    return true;
  };

  // @why Add edges in order; the first one that fails is the answer.
  for (const [a, b] of edges) if (!union(a, b)) return [a, b];
  // @why Not reached for valid input, but keeps the return type happy.
  return [];
}

test("684. Redundant Connection", () => {
  assert.deepEqual(findRedundantConnection([[1, 2], [1, 3], [2, 3]]), [2, 3]);
  assert.deepEqual(findRedundantConnection([[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]), [1, 4]);
  assert.deepEqual(findRedundantConnection([[3, 4], [1, 2], [2, 4], [3, 5], [2, 5]]), [2, 5]);
});
