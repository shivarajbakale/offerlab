/**
 * 1584. Min Cost to Connect All Points
 * Difficulty: Medium
 * Category: Advanced Graphs
 * LeetCode: https://leetcode.com/problems/min-cost-to-connect-all-points/
 *
 * Given an array `points` of 2D integer coordinates, the cost of connecting
 * two points is their Manhattan distance |xi - xj| + |yi - yj|. Return the
 * minimum total cost to connect all points so that there is exactly one
 * simple path between any two points (i.e. a minimum spanning tree).
 *
 * Example 1:
 *   Input: points = [[0,0],[2,2],[3,10],[5,2],[7,0]]
 *   Output: 20
 *
 * Example 2:
 *   Input: points = [[3,12],[-2,5],[-4,1]]
 *   Output: 18
 *
 * Constraints:
 *   1 <= points.length <= 1000
 *   -10^6 <= xi, yi <= 10^6
 *   All points are distinct
 *
 * Approach: Prim's algorithm with a min-heap
 *   Grow the tree from point 0. Pop the cheapest edge to an unvisited
 *   point, add its cost, mark it visited, and push edges from it to every
 *   other unvisited point. Stop once all n points are in the tree.
 *
 * Time: O(n^2 log n)   Space: O(n^2)
 *
 * Pattern: mst, heap-top-k
 * Key insight: Any spanning tree that reaches a new point must cross the cut between
 *   connected and unconnected points, and the cheapest crossing edge is always safe to
 *   take. A min-heap hands Prim's algorithm that cheapest edge each step.
 * Real world: Laying out the cheapest cable, pipe or fiber network connecting all sites,
 *   or clustering points by cutting the most expensive MST edges.
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

// @rule visited is a tree joined by the cheapest edges found; total is its cost
// @why Returns the smallest total wire length that connects every point (a minimum spanning tree).
// @goal what is the cheapest set of wires that joins all {points.length} {points.length === 1 ? "point" : "points"} of {JSON.stringify(points)}?
export function minCostConnectPoints(points: number[][]): number {
  // @why Number of points.
  // @phase Setup: a tree of one point and a heap of offers
  // @say Trying every set of n − 1 wires and checking it connects everything is exponential. Instead grow one tree: always add the cheapest wire from the tree to a point outside it. Any cheaper option would have been taken first, so the greedy choice is never wrong.
  const n = points.length;
  // @why Points already connected to the tree.
  const visited = new Set<number>();
  // @why A priority queue of ways to reach new points, cheapest first.
  const heap = new MinHeap<[number, number]>(); // [cost, point]
  // @why Start from point 0 at no cost.
  // @say Seed the heap with point 0 at cost 0. Every point has to join the tree anyway, so it doesn't matter which one starts it.
  heap.push([0, 0]);
  // @why Running total cost of the connections so far.
  let total = 0;

  // @why Keep going until every point is connected.
  // @phase Grow the tree: take the cheapest offer, then make new offers
  // @yes {visited.size} of {n} points {visited.size === 1 ? "is" : "are"} joined. Take the cheapest offer left.
  // @no All {n} points are joined, so the tree is complete.
  while (visited.size < n) {
    // @why Take the cheapest way to reach any point.
  // @say Pop the cheapest offer: wire to point {heap.data[0][1]} for {heap.data[0][0]}.
    const [cost, i] = heap.pop()!;
    // @why This point may already be connected by a cheaper way; skip the old entry.
  // @yes Point {i} is already in the tree, through a wire at least as cheap as {cost}. This offer is stale, so skip it.
  // @no {visited.size === 0 ? "Point " + i + " is the seed: it starts the tree for free." : "Point " + i + " is not in the tree yet, and " + cost + " is the cheapest wire from the tree to any outside point, so it is safe to use."}
    if (visited.has(i)) continue;
    // @why Connect the point to the tree.
  // @say Join point {i} {JSON.stringify(points[i])} to the tree.
    visited.add(i); // @moment connect point {i} for {cost}
    // @why Pay the cost of this connection.
  // @say Pay {cost}: total {total} + {cost} = {total + cost}.
    total += cost; // @ask total
    // @why Get this point's position.
    const [x1, y1] = points[i];
    // @why Offer a connection to every other point.
  // @yes {j === i ? "Point " + j + " is the one just joined." : "Point " + j + ": does point " + i + " need to offer it a wire?"}
  // @no Point {i} has made its offers to every outside point.
    for (let j = 0; j < n; j++) {
      // @why Skip points that are already connected.
    // @yes {j === i ? "That is point " + i + " itself" : "Point " + j + " is already in the tree"}, so a wire to it would join nothing new.
    // @no Point {j} is still outside, so point {i} offers it a wire.
      if (visited.has(j)) continue;
      // @why Get the other point's position.
      const [x2, y2] = points[j];
      // @why The cost is the Manhattan distance between the two points.
    // @say Wire {i} → {j} costs |{x1} − {x2}| + |{y1} − {y2}| = {Math.abs(x1 - x2) + Math.abs(y1 - y2)}. Push it even if {j} already has a cheaper offer; the heap hands out the cheapest first anyway.
      heap.push([Math.abs(x1 - x2) + Math.abs(y1 - y2), j]);
    }
  }
  // @why Return the total cost.
  // @phase Answer
  // @returns {total}: the cost of the {n - 1} {n - 1 === 1 ? "wire" : "wires"} that join all {n} points, each the cheapest way out of the tree at the time.
  return total;
}

test("1584. Min Cost to Connect All Points", () => {
  assert.equal(minCostConnectPoints([[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]]), 20);
  assert.equal(minCostConnectPoints([[3, 12], [-2, 5], [-4, 1]]), 18);
  assert.equal(minCostConnectPoints([[0, 0]]), 0);
  assert.equal(minCostConnectPoints([[0, 0], [1, 1], [1, 0], [-1, 1]]), 4);
});
