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

export function findRedundantConnection(edges: number[][]): number[] {
  const n = edges.length;
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  const rank = new Array<number>(n + 1).fill(1);

  const find = (x: number): number => {
    while (x !== parent[x]) {
      parent[x] = parent[parent[x]]; // path halving
      x = parent[x];
    }
    return x;
  };

  const union = (a: number, b: number): boolean => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return false;
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    rank[ra] += rank[rb];
    return true;
  };

  for (const [a, b] of edges) if (!union(a, b)) return [a, b];
  return [];
}

test("684. Redundant Connection", () => {
  assert.deepEqual(findRedundantConnection([[1, 2], [1, 3], [2, 3]]), [2, 3]);
  assert.deepEqual(findRedundantConnection([[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]), [1, 4]);
  assert.deepEqual(findRedundantConnection([[3, 4], [1, 2], [2, 4], [3, 5], [2, 5]]), [2, 5]);
});
