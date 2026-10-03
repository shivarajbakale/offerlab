/**
 * 133. Clone Graph
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/clone-graph/
 *
 * Given a reference to a node in a connected undirected graph, return a deep
 * copy (clone) of the graph. Each node has an integer `val` and a list of
 * `neighbors`. Node values are 1..n and unique; the given node has val 1.
 * The graph is given in tests as an adjacency list where index i holds the
 * neighbors of node i + 1.
 *
 * Example 1:
 *   Input: adjList = [[2,4],[1,3],[2,4],[1,3]]
 *   Output: [[2,4],[1,3],[2,4],[1,3]]
 *
 * Example 2:
 *   Input: adjList = [[]]
 *   Output: [[]]
 *
 * Example 3:
 *   Input: adjList = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 100
 *   1 <= Node.val <= 100, all values unique
 *   No repeated edges and no self-loops; the graph is connected
 *
 * Approach: DFS with an old -> new hash map
 *   Recursively clone each node. Before recursing into neighbors, store the
 *   clone in a map so cycles resolve to the already-created copy.
 *
 * Time: O(V + E)   Space: O(V)
 *
 * Pattern: graph-dfs, hashing
 * Key insight: Storing the copy in the old-to-new map BEFORE recursing into neighbors is
 *   what makes cycles safe: when the DFS loops back to a node, it finds the clone already
 *   exists and just links to it.
 * Real world: Deep-copying an object graph with cycles, such as structuredClone in
 *   browsers or a serializer that tracks already-copied objects to preserve shared
 *   references.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A graph node: a value plus a list of the nodes it connects to.
export class GraphNode {
  // @why The number stored in this node.
  val: number;
  // @why Links to adjacent nodes; this is how the graph edges are stored.
  neighbors: GraphNode[];
  // @why Lets us build a node with just a value, starting with no neighbours.
  constructor(val = 0, neighbors: GraphNode[] = []) {
    this.val = val;
    this.neighbors = neighbors;
  }
}

// @why Returns a brand-new copy of the graph, sharing no nodes with the original.
export function cloneGraph(node: GraphNode | null): GraphNode | null {
  // @why Maps each original node to its copy, so a node is never copied twice.
  const clones = new Map<GraphNode, GraphNode>();

  // @why Returns the copy of node `n`, building it if it does not exist yet.
  const dfs = (n: GraphNode): GraphNode => {
    // @why Check if this node was already copied.
    const existing = clones.get(n);
    // @why Already copied (we hit a cycle or a shared neighbour), so reuse that copy.
    if (existing) return existing;
    // @why Make the new node with the same value but no neighbours yet.
    const copy = new GraphNode(n.val);
    // @why Save the copy BEFORE visiting neighbours, so a cycle back to `n` finds it.
    clones.set(n, copy);
    // @why Copy every neighbour and link the copies together.
    for (const nb of n.neighbors) copy.neighbors.push(dfs(nb));
    // @why Hand back the finished copy to whoever linked to it.
    return copy;
  };

  // @why An empty graph (null) has nothing to clone; otherwise start from the given node.
  return node ? dfs(node) : null;
}

// --- test helpers ---
function build(adj: number[][]): GraphNode | null {
  if (adj.length === 0) return null;
  const nodes = adj.map((_, i) => new GraphNode(i + 1));
  adj.forEach((nbs, i) => {
    nodes[i].neighbors = nbs.map((v) => nodes[v - 1]);
  });
  return nodes[0];
}

function collect(node: GraphNode | null): Map<number, GraphNode> {
  const seen = new Map<number, GraphNode>();
  const stack = node ? [node] : [];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n.val)) continue;
    seen.set(n.val, n);
    stack.push(...n.neighbors);
  }
  return seen;
}

function toAdj(node: GraphNode | null): number[][] {
  const seen = collect(node);
  return [...seen.keys()]
    .sort((a, b) => a - b)
    .map((v) => seen.get(v)!.neighbors.map((n) => n.val));
}

test("133. Clone Graph", () => {
  for (const adj of [[[2, 4], [1, 3], [2, 4], [1, 3]], [[]], []]) {
    const original = build(adj);
    const copy = cloneGraph(original);
    assert.deepEqual(toAdj(copy), adj);
    // No node in the clone may be shared with the original.
    const origNodes = new Set(collect(original).values());
    for (const n of collect(copy).values()) assert.ok(!origNodes.has(n));
  }
});
