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
// @goal do the edges {JSON.stringify(edges)} make the {n} nodes into one tree?
export function validTree(n: number, edges: number[][]): boolean {
  // @why A tree always has exactly n - 1 edges; any other count fails right away.
  // @phase Count the edges first
  // @yes A tree on {n} {n === 1 ? "node" : "nodes"} has exactly {n - 1} {n - 1 === 1 ? "edge" : "edges"}, but there {edges.length === 1 ? "is 1" : "are " + edges.length}. {edges.length < n - 1 ? "Too few edges can't connect every node." : "An extra edge always closes a cycle."}
  // @no {edges.length} {edges.length === 1 ? "edge" : "edges"} for {n} nodes: exactly right for a tree. Now it is a tree only if the edges reach every node without a cycle.
  // @returns false: the edge count alone rules out a tree.
  if (edges.length !== n - 1) return false;

  // @why Adjacency list: the neighbours of each node.
  // @phase Setup: neighbour lists
  // @say Checking every possible pair of paths for a second route is hopeless. Instead walk the graph once from node 0: meeting an already-reached node by any edge other than the one just used means a cycle.
  const adj: number[][] = Array.from({ length: n }, () => []);
  // @why The edges are undirected, so add each one in both directions.
  // @say Take the edges one at a time and record each in both directions.
  for (const [a, b] of edges) {
    // @why a can reach b.
    // @say Edge {a}–{b} works both ways. First, {b} is a neighbour of {a}.
    adj[a].push(b);
    // @why b can reach a.
    // @say And {a} is a neighbour of {b}.
    adj[b].push(a);
  }

  // @why Nodes already reached by the DFS.
  // @say Remember every node reached, to spot a second route into one.
  const visited = new Set<number>();
  // @why Returns false if a cycle is found; `prev` is the node we just came from.
  // @phase Walk from node 0, watching for a second route
  // @goal is the part of the graph reached through {node}{prev === -1 ? " (the start)" : " from " + prev} free of cycles?
  const dfs = (node: number, prev: number): boolean => {
    // @why Reaching a node twice by a different route means a cycle.
    // @yes {node} was already reached by another route. Reaching it again from {prev} means two paths lead to it: a cycle.
    // @no First time at {node}{prev === -1 ? "" : ", reached from " + prev}.
    // @returns false: a cycle, so this is not a tree.
    if (visited.has(node)) return false; // @broken
    // @why Mark this node as reached.
    // @say Mark {node} as reached. Any later edge that leads here, other than the one just used, would be a second route.
    visited.add(node); // @ask visited.size // @moment visit {node} from {prev}
    // @why Visit each neighbour.
    // @say Walk on to each neighbour of {node}: {JSON.stringify(adj[node])}.
    for (const nb of adj[node]) {
      // @why Going back along the edge we came from is not a cycle in an undirected graph.
      // @yes {nb} is where we just came from. Each edge is stored both ways, so going back along it is not a second route.
      // @no Neighbour {nb} is not the node we came from, so follow the edge.
      if (nb === prev) continue;
      // @why A cycle further down means this is not a tree.
      // @yes The walk from {nb} found a cycle, so the whole graph is not a tree.
      // @no Nothing below {nb} loops back.
      // @say Follow the edge to {nb}: is everything reached through {nb} free of cycles?
      // @returns false: a cycle was found below {node}.
      if (!dfs(nb, node)) return false;
    }
    // @why No cycle found from this node.
    // @returns true: no edge from {node} or below it leads to a node reached another way.
    return true;
  };

  // @why No cycle, and reaching all n nodes proves the graph is connected.
  // @phase Answer: no cycle, and everything reached
  // @say Walk from node 0. With exactly {n - 1} edges, the graph is a tree if the walk finds no cycle and reaches all {n} nodes.
  // @returns {visited.size === n ? "true: no cycle, and " + (n === 1 ? "the only node is" : "all " + n + " nodes are") + " reached, so it is one tree." : "false: " + (visited.size < n ? "only " + visited.size + " of " + n + " nodes are reachable from 0, so the graph is in pieces." : "a cycle was found.")}
  return dfs(0, -1) && visited.size === n;
}

test("261. Graph Valid Tree", () => {
  assert.equal(validTree(5, [[0, 1], [0, 2], [0, 3], [1, 4]]), true);
  assert.equal(validTree(5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]), false);
  assert.equal(validTree(1, []), true);
  // n - 1 edges but disconnected (has a cycle elsewhere).
  assert.equal(validTree(4, [[0, 1], [1, 2], [2, 0]]), false);
});
