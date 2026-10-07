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

// @rule visited holds the nodes reached so far, each by exactly one path from 0
// @why Returns true if the edges connect all n nodes with no cycle.
export function validTree(n: number, edges: number[][]): boolean {
  // @why A tree always has exactly n - 1 edges; any other count fails right away.
  if (edges.length !== n - 1) return false;

  // @why Adjacency list: the neighbours of each node.
  const adj: number[][] = Array.from({ length: n }, () => []);
  // @why The edges are undirected, so add each one in both directions.
  for (const [a, b] of edges) {
    // @why a can reach b.
    adj[a].push(b);
    // @why b can reach a.
    adj[b].push(a);
  }

  // @why Nodes already reached by the DFS.
  const visited = new Set<number>();
  // @why Returns false if a cycle is found; `prev` is the node we just came from.
  const dfs = (node: number, prev: number): boolean => {
    // @why Reaching a node twice by a different route means a cycle.
    if (visited.has(node)) return false; // @broken
    // @why Mark this node as reached.
    visited.add(node); // @ask visited.size // @moment visit {node} from {prev}
    // @why Visit each neighbour.
    for (const nb of adj[node]) {
      // @why Going back along the edge we came from is not a cycle in an undirected graph.
      if (nb === prev) continue;
      // @why A cycle further down means this is not a tree.
      if (!dfs(nb, node)) return false;
    }
    // @why No cycle found from this node.
    return true;
  };

  // @why No cycle, and reaching all n nodes proves the graph is connected.
  return dfs(0, -1) && visited.size === n;
}

test("261. Graph Valid Tree", () => {
  assert.equal(validTree(5, [[0, 1], [0, 2], [0, 3], [1, 4]]), true);
  assert.equal(validTree(5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]), false);
  assert.equal(validTree(1, []), true);
  // n - 1 edges but disconnected (has a cycle elsewhere).
  assert.equal(validTree(4, [[0, 1], [1, 2], [2, 0]]), false);
});
