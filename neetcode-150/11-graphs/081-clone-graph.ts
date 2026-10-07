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

// @rule clones maps every original node seen so far to its one and only copy
// @why Returns a brand-new copy of the graph, sharing no nodes with the original.
// @goal {node ? "how do you copy the graph reachable from node " + node.val + ", sharing no nodes with it?" : "what is the copy of an empty graph?"}
export function cloneGraph(node: GraphNode | null): GraphNode | null {
  // @why Maps each original node to its copy, so a node is never copied twice.
  // @phase Setup: a map from each original to its copy
  // @say Copying each node and then its neighbours blindly loops forever on a cycle (1 → 2 → 1 → …) and duplicates shared nodes. Remember every copy made, keyed by the original, so each node is copied exactly once.
  const clones = new Map<GraphNode, GraphNode>();

  // @why Returns the copy of node `n`, building it if it does not exist yet.
  // @phase Copy a node, then its neighbours
  // @goal what is the copy of node {n.val}?
  const dfs = (n: GraphNode): GraphNode => {
    // @why Check if this node was already copied.
    // @say Has node {n.val} been copied already? The map answers in one lookup.
    const existing = clones.get(n);
    // @why Already copied (we hit a cycle or a shared neighbour), so reuse that copy.
    // @yes Node {n.val} already has a copy: this edge leads back to a node in progress or done. Making a second copy would split one node into two.
    // @no First visit to node {n.val}, so build its copy.
    // @returns the existing copy of node {n.val}, so every edge into {n.val} points at one shared copy.
    if (existing) return existing;
    // @why Make the new node with the same value but no neighbours yet.
    // @say Make a copy of node {n.val} with no edges yet. Its neighbours' copies may not exist, so the edges are filled in next.
    const copy = new GraphNode(n.val); // @moment copy node {n.val}
    // @why Save the copy BEFORE visiting neighbours, so a cycle back to `n` finds it.
    // @say Register the copy of node {n.val} now, before visiting any neighbour. A cycle that leads back to node {n.val} will find this copy instead of recursing forever.
    // @then {clones.size} {clones.size === 1 ? "node has" : "nodes have"} a copy.
    clones.set(n, copy); // @ask clones.size
    // @why Copy every neighbour and link the copies together.
    // @say Neighbour {nb.val} of node {n.val} (of {n.neighbors.map((x) => x.val).join(", ")}): get its copy, building it if needed, and link it to the copy of {n.val}.
    // @then {copy.neighbors.length ? "The copy of node " + n.val + " now links to " + copy.neighbors.map((x) => x.val).join(", ") + (copy.neighbors.length === n.neighbors.length ? ", the same neighbours as the original." : ", " + copy.neighbors.length + " of its " + n.neighbors.length + " edges so far.") : "Node " + n.val + " has no neighbours, so its copy needs no edges."}
    for (const nb of n.neighbors) copy.neighbors.push(dfs(nb));
    // @why Hand back the finished copy to whoever linked to it.
    // @returns the finished copy of node {n.val}, {copy.neighbors.length === 0 ? "with no edges, like the original" : copy.neighbors.length === 1 ? "with its one edge linked to a copy" : "with all " + copy.neighbors.length + " edges linked to copies"}.
    return copy;
  };

  // @why An empty graph (null) has nothing to clone; otherwise start from the given node.
  // @phase Start from the given node
  // @say {node ? "Start copying from node " + node.val + ". Every node is reachable from it, so the copy covers the whole graph." : "No node given: an empty graph copies to an empty graph."}
  // @returns {node ? "the copy of node " + node.val + ". Every node and edge was copied once, O(V + E)." : "null, the copy of an empty graph."}
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
