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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class GraphNode {
  val: number;
  neighbors: GraphNode[];
  constructor(val = 0, neighbors: GraphNode[] = []) {
    this.val = val;
    this.neighbors = neighbors;
  }
}

export function cloneGraph(node: GraphNode | null): GraphNode | null {
  // TODO: implement
  throw new Error("Not implemented");
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
