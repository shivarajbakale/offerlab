/**
 * 1851. Minimum Interval to Include Each Query
 * Difficulty: Hard
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/minimum-interval-to-include-each-query/
 *
 * You are given `intervals` where intervals[i] = [left, right] (inclusive);
 * its size is right - left + 1. You are also given `queries`. For each
 * query q, find the size of the smallest interval with left <= q <= right,
 * or -1 if no interval contains q. Return the answers in query order.
 *
 * Example 1:
 *   Input: intervals = [[1,4],[2,4],[3,6],[4,4]], queries = [2,3,4,5]
 *   Output: [3,3,1,4]
 *
 * Example 2:
 *   Input: intervals = [[2,3],[2,5],[1,8],[20,25]], queries = [2,19,5,22]
 *   Output: [2,-1,4,6]
 *
 * Constraints:
 *   1 <= intervals.length, queries.length <= 10^5
 *   1 <= left <= right <= 10^7
 *   1 <= queries[j] <= 10^7
 *
 * Approach: Offline sweep with a min-heap
 *   Sort intervals by left and process queries in increasing order. For
 *   each query, push every interval whose left <= q as [size, right]. Pop
 *   heap tops whose right < q (they can never cover this or later queries).
 *   The heap top, if any, is the smallest covering interval. Cache answers
 *   per query value and map back to original order.
 *
 * Time: O(n log n + q log q)   Space: O(n + q)
 *
 * Pattern: intervals,heap-top-k
 * Key insight: Answering queries in sorted order lets intervals be added once as their
 *   left end is passed, and removed for good once their right end falls behind the query.
 *   A min-heap by size then gives the smallest live interval at the top.
 * Real world: An IP-geolocation or routing table lookup that, for each address, finds the
 *   most specific (smallest) range containing it, processing a batch of lookups offline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** Minimal binary min-heap keyed by the first tuple element. */
// @why A small min-heap so we can always grab the smallest item quickly.
class MinHeap<T extends number[]> {
  // @why The heap, stored as an array.
  private data: T[] = [];

  // @why How many items are in the heap.
  get size(): number {
    // @why Just the array length.
    return this.data.length;
  }

  // @why Look at the smallest item without removing it.
  peek(): T | undefined {
    // @why The smallest item is always at the front.
    return this.data[0];
  }

  // @why Add an item and move it up until the heap order is right.
  push(item: T): void {
    // @why Short name for the array.
    const a = this.data;
    // @why Put the new item at the bottom.
    a.push(item);
    // @why Where the new item currently sits.
    let i = a.length - 1;
    // @why Move up until it reaches the top or its parent is smaller.
    while (i > 0) {
      // @why Index of the parent.
      const p = (i - 1) >> 1;
      // @why The parent is already smaller or equal, so the order is fine.
      if (a[p][0] <= a[i][0]) break;
      // @why Swap with the parent to move the smaller item up.
      [a[p], a[i]] = [a[i], a[p]];
      // @why Continue from the parent's spot.
      i = p;
    }
  }

  // @why Remove and return the smallest item.
  pop(): T | undefined {
    // @why Short name for the array.
    const a = this.data;
    // @why Nothing to remove.
    if (a.length === 0) return undefined;
    // @why Save the smallest item to return.
    const top = a[0];
    // @why Take the last item out so the array stays compact.
    const last = a.pop()!;
    // @why If items remain, fill the hole at the top with the last item.
    if (a.length) {
      // @why Put it at the top, then push it down to its right place.
      a[0] = last;
      // @why Where the moved item currently sits.
      let i = 0;
      // @why Keep moving down until it is in place.
      for (;;) {
        // @why Index of the left child.
        const l = 2 * i + 1;
        // @why Index of the right child.
        const r = l + 1;
        // @why Index of the smallest among the item and its children.
        let m = i;
        // @why Left child is smaller, so it is the candidate.
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        // @why Right child is even smaller.
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        // @why Neither child is smaller, so the item is in place.
        if (m === i) break;
        // @why Swap with the smaller child to move down.
        [a[m], a[i]] = [a[i], a[m]];
        // @why Continue from the child's spot.
        i = m;
      }
    }
    // @why The smallest item that was at the top.
    return top;
  }
}

// @why For each query, returns the size of the smallest interval containing it, or -1.
export function minInterval(intervals: number[][], queries: number[]): number[] {
  // @why Sort intervals by start so we can add them as queries grow.
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  // @why Holds the intervals that have started, ordered by size; `right` is kept to spot expired ones.
  const heap = new MinHeap<[number, number]>(); // [size, right]
  // @why Saves each query's result, since we answer in sorted order.
  const answer = new Map<number, number>();
  // @why Next interval not yet added to the heap.
  let i = 0;

  // @why Handle queries from small to large, so intervals that expired once stay expired.
  for (const q of [...queries].sort((a, b) => a - b)) {
    // @why Add every interval that starts at or before `q`.
    while (i < sorted.length && sorted[i][0] <= q) {
      // @why Left and right ends of the interval being added.
      const [l, r] = sorted[i++];
      // @why Store its size first so the smallest comes out on top.
      heap.push([r - l + 1, r]);
    }
    // @why Throw away intervals that end before `q`; they cannot cover it, or any later query.
    while (heap.size && heap.peek()![1] < q) heap.pop();
    // @why The top of the heap is the smallest interval covering `q`, or -1 if the heap is empty.
    answer.set(q, heap.size ? heap.peek()![0] : -1);
  }
  // @why Return the answers in the original query order.
  return queries.map((q) => answer.get(q)!);
}

test("1851. Minimum Interval to Include Each Query", () => {
  assert.deepEqual(minInterval([[1, 4], [2, 4], [3, 6], [4, 4]], [2, 3, 4, 5]), [3, 3, 1, 4]);
  assert.deepEqual(minInterval([[2, 3], [2, 5], [1, 8], [20, 25]], [2, 19, 5, 22]), [2, -1, 4, 6]);
  assert.deepEqual(minInterval([[5, 5]], [1, 5, 5, 9]), [-1, 1, 1, -1]);
});
