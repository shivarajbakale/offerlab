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
  private data: T[] = [];

  get size(): number {
    return this.data.length;
  }

  push(item: T): void {
    const a = this.data;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.data;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function networkDelayTime(times: number[][], n: number, k: number): number {
  const adj: [number, number][][] = Array.from({ length: n + 1 }, () => []);
  for (const [u, v, w] of times) adj[u].push([v, w]);

  const visited = new Set<number>();
  const heap = new MinHeap<[number, number]>(); // [time, node]
  heap.push([0, k]);
  let elapsed = 0;

  while (heap.size) {
    const [t, node] = heap.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    elapsed = t;
    for (const [nb, w] of adj[node]) {
      if (!visited.has(nb)) heap.push([t + w, nb]);
    }
  }
  return visited.size === n ? elapsed : -1;
}

test("743. Network Delay Time", () => {
  assert.equal(networkDelayTime([[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2), 2);
  assert.equal(networkDelayTime([[1, 2, 1]], 2, 1), 1);
  assert.equal(networkDelayTime([[1, 2, 1]], 2, 2), -1);
  // Indirect path is shorter than the direct edge.
  assert.equal(networkDelayTime([[1, 2, 10], [1, 3, 1], [3, 2, 1]], 3, 1), 2);
});
