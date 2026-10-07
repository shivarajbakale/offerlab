/**
 * 743. Network Delay Time
 * Difficulty: Medium
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/network-delay-time/
 *
 * There are `n` network nodes labeled 1..n and a list of directed travel
 * times `times[i] = [u, v, w]` meaning a signal takes w time to go from u to
 * v. A signal is sent from node `k`. Return the minimum time for all n nodes
 * to receive it, or -1 if some node can never receive it.
 *
 * Example 1:
 *   Input: times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2
 *   Output: 2
 *
 * Example 2:
 *   Input: times = [[1,2,1]], n = 2, k = 1
 *   Output: 1
 *
 * Example 3:
 *   Input: times = [[1,2,1]], n = 2, k = 2
 *   Output: -1
 *
 * Constraints:
 *   1 <= k <= n <= 100
 *   1 <= times.length <= 6000
 *   0 <= w <= 100, all (u, v) pairs unique
 *
 * Approach: Dijkstra's algorithm
 *   Min-heap of [time, node] starting from [0, k]. Pop the closest unvisited
 *   node; its time is final. Push its neighbors with accumulated time. The
 *   answer is the time of the last node finalized, if all n were reached.
 *
 * Time: O(E log V)   Space: O(V + E)
 *
 * Pattern: shortest-path, heap-top-k
 * Key insight: With non-negative weights, the node popped first from the min-heap can
 *   never be reached more cheaply later, so its time is final. The answer is the last
 *   finalized time, since the signal must reach everyone.
 * Real world: Link-state routing protocols like OSPF running Dijkstra to compute the
 *   fastest path and arrival time from a router to every other router.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** Minimal binary min-heap keyed by the first tuple element. */
class MinHeap<T extends number[]> {
  // @why The heap's items live in a plain array; the smallest first value is kept at index 0.
  private data: T[] = [];

  // @why Lets the caller ask how many items are still waiting.
  get size(): number {
    return this.data.length;
  }

  // @why Add an item; it must then float up to its right place.
  push(item: T): void {
    // @why A short name for the array so the code below is easier to read.
    const a = this.data;
    // @why Put the new item at the end, the only free spot in a heap array.
    a.push(item);
    // @why `i` tracks where the new item currently sits.
    let i = a.length - 1;
    // @why Keep moving up until it reaches the root.
    while (i > 0) {
      // @why The parent of index `i` sits at (i - 1) / 2, rounded down.
      const p = (i - 1) >> 1;
      // @why If the parent is already smaller or equal, the heap rule holds, so stop.
      if (a[p][0] <= a[i][0]) break;
      // @why The parent is bigger, so swap them to push the smaller item upward.
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  // @why Remove and return the smallest item (the root).
  pop(): T | undefined {
    const a = this.data;
    // @why An empty heap has nothing to give back.
    if (a.length === 0) return undefined;
    // @why Save the smallest item now, because we're about to overwrite the root.
    const top = a[0];
    // @why Take the last item out so the array stays gap-free.
    const last = a.pop()!;
    // @why If anything is left, the old root's spot must be refilled.
    if (a.length) {
      // @why Move the last item to the top; it is probably too big, so it must sink.
      a[0] = last;
      let i = 0;
      // @why Keep sinking until it is smaller than its children.
      for (;;) {
        // @why Indexes of the left and right children of `i`.
        const l = 2 * i + 1;
        const r = l + 1;
        // @why `m` is the smallest of the item and its two children; start by assuming it is `i`.
        let m = i;
        // @why If the left child exists and is smaller, it becomes the candidate.
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        // @why Same check for the right child.
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        // @why Neither child is smaller, so the item is in its right place.
        if (m === i) break;
        // @why Swap with the smaller child to push the big item down.
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    // @why Hand back the smallest item we saved at the start.
    return top;
  }
}

// @rule nodes leave the heap in order of arrival time, so a first pop is the fastest
// @why Returns the time for a signal from `k` to reach all `n` nodes, or -1 if it can't.
// @goal a signal leaves node {k}: how long until all {n} nodes have heard it, if they ever do?
export function networkDelayTime(times: number[][], n: number, k: number): number {
  // @why A list of outgoing edges for each node; nodes are numbered from 1.
  // @phase Setup: who can signal whom, and how fast
  // @say Trying every path to every node is exponential, and plain BFS ignores edge times. Dijkstra settles nodes in order of arrival time instead: the earliest unsettled arrival can't be beaten, because any other route is already later before it even arrives.
  const adj: [number, number][][] = Array.from({ length: n + 1 }, () => []);
  // @why Store each edge as (neighbor, travel time).
  // @say Edge {u} → {v} takes {w}.
  for (const [u, v, w] of times) adj[u].push([v, w]);

  // @why Nodes whose shortest time is already final.
  const visited = new Set<number>();
  // @why A priority queue that gives the closest unfinished node first.
  const heap = new MinHeap<[number, number]>(); // [time, node]
  // @why The signal starts at node `k` at time 0.
  // @say Node {k} has the signal at time 0.
  heap.push([0, k]);
  // @why The time at which the last node was reached.
  let elapsed = 0;

  // @why Keep going while some node is still waiting.
  // @phase Settle nodes in order of arrival time
  // @yes {heap.data.length ? heap.data.length + (heap.data.length === 1 ? " arrival is" : " arrivals are") + " waiting. Settle the earliest one." : "No arrivals left to process: every node the signal can reach has been settled."}
  // @no {heap.data.length ? heap.data.length + (heap.data.length === 1 ? " arrival is" : " arrivals are") + " waiting. Settle the earliest one." : "No arrivals left to process: every node the signal can reach has been settled."}
  while (heap.size) {
    // @why Take the node with the smallest arrival time.
    // @say Earliest pending arrival: node {heap.data[0][1]} at time {heap.data[0][0]}.
    const [t, node] = heap.pop()!;
    // @why Skip it if we already found a faster way to it.
    // @yes Node {node} was already settled at an earlier time, so arriving at {t} changes nothing. Skip this stale entry.
    // @no Node {node} is not settled yet, and nothing still waiting arrives before {t}, so {t} is its fastest time.
    if (visited.has(node)) continue;
    // @why This is the fastest way to this node, so its time is final.
    // @say Settle node {node} at time {t}.
    visited.add(node); // @moment signal reaches {node} at {t}
    // @why Times only go up as we pop, so this is the latest arrival so far.
    // @say Nodes settle in time order, so {t} is the latest arrival yet. The last node settled sets the answer.
    elapsed = t; // @ask elapsed
    // @why Look at every edge leaving this node.
    // @say Edge {node} → {nb} takes {w}.
    for (const [nb, w] of adj[node]) {
      // @why Queue the neighbor with its arrival time through this node.
      // @yes Node {nb} isn't settled, so offer it an arrival at {t} + {w} = {t + w}. If a faster offer exists, the heap gives that one first.
      // @no Node {nb} is already settled at an earlier time, so going through {node} can't help it.
      if (!visited.has(nb)) heap.push([t + w, nb]);
    }
  }
  // @why If every node was reached, the answer is the last arrival time; otherwise -1.
  // @phase Answer
  // @returns {visited.size === n ? elapsed + ": all " + n + " nodes heard the signal, and the last one heard it at time " + elapsed + "." : "-1: only " + visited.size + " of " + n + " nodes can be reached from " + k + ", so the rest never hear it."}
  return visited.size === n ? elapsed : -1;
}

test("743. Network Delay Time", () => {
  assert.equal(networkDelayTime([[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2), 2);
  assert.equal(networkDelayTime([[1, 2, 1]], 2, 1), 1);
  assert.equal(networkDelayTime([[1, 2, 1]], 2, 2), -1);
  // Indirect path is shorter than the direct edge.
  assert.equal(networkDelayTime([[1, 2, 10], [1, 3, 1], [3, 2, 1]], 3, 1), 2);
});
