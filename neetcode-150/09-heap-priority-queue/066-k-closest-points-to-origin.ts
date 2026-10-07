/**
 * 973. K Closest Points to Origin
 * Difficulty: Medium
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/k-closest-points-to-origin/
 *
 * Given an array of `points` where points[i] = [xi, yi] and an integer `k`,
 * return the `k` points closest to the origin (0, 0) by Euclidean distance.
 * The answer may be returned in any order and is guaranteed to be unique
 * (except for order).
 *
 * Example 1:
 *   Input: points = [[1, 3], [-2, 2]], k = 1
 *   Output: [[-2, 2]]
 *
 * Example 2:
 *   Input: points = [[3, 3], [5, -1], [-2, 4]], k = 2
 *   Output: [[3, 3], [-2, 4]]
 *
 * Constraints:
 *   1 <= k <= points.length <= 10^4
 *   -10^4 <= xi, yi <= 10^4
 *
 * Approach: Max-heap of size k
 *   Compare by squared distance (no sqrt needed). Keep a max-heap of the k
 *   closest points seen so far; when it grows past k, evict the farthest.
 *
 * Time: O(n log k)   Space: O(k)
 *
 * Pattern: heap-top-k
 * Key insight: Keeping a max-heap of size k means the root is the farthest of the current
 *   best k, so any closer point simply evicts it. Comparing squared distances avoids sqrt
 *   without changing the order.
 * Real world: Map apps and ride-hailing systems returning the k nearest drivers or
 *   restaurants to a location.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A binary heap: the best item by `cmp` is always at the front, in O(log n) per change.
class Heap<T> {
  // @why The heap stored flat in an array; the children of index i are 2i+1 and 2i+2.
  private data: T[] = [];
  // @why Says which of two items belongs nearer the top (negative means `a` first).
  private cmp: (a: T, b: T) => number;

  // @why Pass in the ordering, so one class works as a min-heap or max-heap.
  constructor(cmp: (a: T, b: T) => number) {
    // @why Keep the ordering for later comparisons.
    this.cmp = cmp;
  }

  // @why How many items are in the heap.
  size(): number {
    return this.data.length;
  }

  // @why Look at the top item without removing it.
  peek(): T | undefined {
    return this.data[0];
  }

  // @why A copy of everything in the heap, in no particular order.
  toArray(): T[] {
    return [...this.data];
  }

  // @why Add an item and keep the heap rule true.
  push(val: T): void {
    // @why A short name for the array.
    const d = this.data;
    // @why Put the new item at the end, the only free slot.
    d.push(val);
    // @why `i` is where the new item sits as it moves up.
    let i = d.length - 1;
    // @why Climb until the item reaches the root.
    while (i > 0) {
      // @why Index of the parent.
      const p = (i - 1) >> 1;
      // @why The parent is already as good or better, so the item is in place.
      if (this.cmp(d[i], d[p]) >= 0) break;
      // @why The item beats its parent, so swap them.
      [d[i], d[p]] = [d[p], d[i]];
      // @why Continue from the parent's old spot.
      i = p;
    }
  }

  // @why Remove and return the top item.
  pop(): T | undefined {
    // @why A short name for the array.
    const d = this.data;
    // @why Nothing to remove from an empty heap.
    if (d.length === 0) return undefined;
    // @why Save the top item, since we will overwrite its spot.
    const top = d[0];
    // @why Take the last item off the end so the array stays gap-free.
    const last = d.pop()!;
    // @why If the heap is now empty there is nothing to rebalance.
    if (d.length > 0) {
      // @why Put the last item at the root; it is probably in the wrong place.
      d[0] = last;
      // @why `i` is where that item sits as it sinks down.
      let i = 0;
      // @why Sink it down until it fits.
      for (;;) {
        // @why Index of the left child.
        const l = 2 * i + 1;
        // @why Index of the right child.
        const r = l + 1;
        // @why Track which of the three (item, left, right) should be on top.
        let best = i;
        // @why If the left child exists and beats the current best, pick it.
        if (l < d.length && this.cmp(d[l], d[best]) < 0) best = l;
        // @why Same check for the right child.
        if (r < d.length && this.cmp(d[r], d[best]) < 0) best = r;
        // @why The item beats both children, so it is in place.
        if (best === i) break;
        // @why Swap with the better child to push the item down.
        [d[i], d[best]] = [d[best], d[i]];
        // @why Continue from the child's spot.
        i = best;
      }
    }
    // @why Give back the item that was on top.
    return top;
  }
}

// @rule the heap holds the k closest points seen so far, farthest on top
// @why Return the k points nearest the origin, in any order.
export function kClosest(points: number[][], k: number): number[][] {
  // @why Squared distance is enough to compare, so no slow square root.
  const dist = (p: number[]) => p[0] * p[0] + p[1] * p[1];
  // @why A max-heap of the k best so far; the farthest of them is on top.
  const heap = new Heap<number[]>((a, b) => dist(b) - dist(a)); // max-heap
  // @why Look at each point once.
  for (const p of points) {
    // @why Add the point to the heap.
    heap.push(p);
    // @why Over k points: drop the farthest, since it can't be one of the closest.
    if (heap.size() > k) heap.pop(); // @ask heap.data[0].join()
  }
  // @why What is left in the heap is the k closest.
  return heap.toArray();
}

const sortPts = (pts: number[][]) =>
  [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

test("973. K Closest Points to Origin", () => {
  assert.deepEqual(kClosest([[1, 3], [-2, 2]], 1), [[-2, 2]]);
  assert.deepEqual(
    sortPts(kClosest([[3, 3], [5, -1], [-2, 4]], 2)),
    sortPts([[3, 3], [-2, 4]]),
  );
  // k equals number of points
  assert.deepEqual(sortPts(kClosest([[0, 1], [1, 0]], 2)), [[0, 1], [1, 0]]);
});
