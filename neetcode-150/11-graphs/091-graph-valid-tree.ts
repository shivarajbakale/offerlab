/**
 * 261. Graph Valid Tree (Premium; LintCode 178)
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/graph-valid-tree/
 *
 * Given `n` nodes labeled 0..n-1 and a list of undirected `edges` (each a
 * pair of nodes), determine whether these edges form a valid tree: the
 * graph must be fully connected and contain no cycles.
 *
 * Example 1:
 *   Input: n = 5, edges = [[0,1],[0,2],[0,3],[1,4]]
 *   Output: true
 *
 * Example 2:
 *   Input: n = 5, edges = [[0,1],[1,2],[2,3],[1,3],[1,4]]
 *   Output: false
 *
 * Constraints:
 *   1 <= n <= 100
 *   0 <= edges.length <= n * (n - 1) / 2
 *   No duplicate edges and no self-loops
 *
 * Approach: DFS with parent tracking
 *   A tree on n nodes has exactly n - 1 edges, so reject early otherwise.
 *   DFS from node 0, skipping the edge back to the parent; meeting an
 *   already-visited node means a cycle. Finally, every node must be visited.
 *
 * Time: O(V + E)   Space: O(V + E)
 *
 * Pattern: graph-dfs, union-find
 * Key insight: A tree on n nodes has exactly n - 1 edges, and once that holds, being
 *   connected is enough to rule out a cycle. The DFS skips only the edge back to its
 *   parent, so meeting any visited node means a cycle. Union-find solves the same check.
 * Real world: Validating that a network or org chart is a proper hierarchy: every node
 *   reachable, no loops, and exactly one path between any two nodes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function validTree(n: number, edges: number[][]): boolean {
  if (edges.length !== n - 1) return false;

  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }

  const visited = new Set<number>();
  const dfs = (node: number, prev: number): boolean => {
    if (visited.has(node)) return false;
    visited.add(node);
    for (const nb of adj[node]) {
      if (nb === prev) continue;
      if (!dfs(nb, node)) return false;
    }
    return true;
  };

  return dfs(0, -1) && visited.size === n;
}

test("261. Graph Valid Tree", () => {
  assert.equal(validTree(5, [[0, 1], [0, 2], [0, 3], [1, 4]]), true);
  assert.equal(validTree(5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]), false);
  assert.equal(validTree(1, []), true);
  // n - 1 edges but disconnected (has a cycle elsewhere).
  assert.equal(validTree(4, [[0, 1], [1, 2], [2, 0]]), false);
});
