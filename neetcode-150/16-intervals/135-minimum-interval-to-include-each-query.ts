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

// @rule heap holds intervals that start by q, smallest size on top; ended ones get popped
// @why For each query, returns the size of the smallest interval containing it, or -1.
// @goal for each query in {JSON.stringify(queries)}, how big is the smallest interval from {JSON.stringify(intervals)} that contains it?
export function minInterval(intervals: number[][], queries: number[]): number[] {
  // @why Sort intervals by start so we can add them as queries grow.
  // @phase Setup: sort intervals so they can join in order
  // @say Checking every interval against every query is (intervals × queries) work. Instead sweep the queries from small to large: an interval joins once its start is reached and is dropped once its end falls behind, so each one is handled only a few times.
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  // @why Holds the intervals that have started, ordered by size; `right` is kept to spot expired ones.
  // @say A min-heap ordered by size keeps the smallest started interval on top, so each query reads its answer straight off the top.
  const heap = new MinHeap<[number, number]>(); // [size, right]
  // @why Saves each query's result, since we answer in sorted order.
  const answer = new Map<number, number>();
  // @why Next interval not yet added to the heap.
  let i = 0;

  // @why Handle queries from small to large, so intervals that expired once stay expired.
  // @phase Sweep the queries from smallest to largest
  // @say Smallest query first: {q}.
  for (const q of [...queries].sort((a, b) => a - b)) {
    // @why Add every interval that starts at or before `q`.
    // @yes [{sorted[i][0]},{sorted[i][1]}] starts at {sorted[i][0]}, at or before {q}, so it may contain {q}. Add it.
    // @no {i < sorted.length ? "The next interval starts at " + sorted[i][0] + ", after " + q + ", so it can't contain " + q + "; it waits for a larger query." : "Every interval has been added already."}
    while (i < sorted.length && sorted[i][0] <= q) {
      // @why Left and right ends of the interval being added.
      const [l, r] = sorted[i++];
      // @why Store its size first so the smallest comes out on top.
      // @say Push size {r} − {l} + 1 = {r - l + 1}, together with its right end {r} so you can tell later when it has run out.
      heap.push([r - l + 1, r]); // @ask heap.data.length
    }
    // @why Throw away intervals that end before `q`; they cannot cover it, or any later query.
    // @yes The smallest interval on top ends at {heap.data[0][1]}, before {q}. It can't contain {q}, and later queries are even larger, so drop it for good.
    // @no {heap.data.length ? "The top interval ends at " + heap.data[0][1] + ", at or after " + q + ", and it started by " + q + ", so it contains " + q + ". Expired ones buried below can wait: only the top is read." : "The heap is empty: no started interval reaches " + q + "."}
    // @say {heap.data.length && heap.data[0][1] < q ? "The smallest interval on top, size " + heap.data[0][0] + ", ends at " + heap.data[0][1] + ", before " + q + ". It can't contain " + q + ", and later queries are even larger, so drop it for good." : heap.data.length ? "The top interval ends at " + heap.data[0][1] + ", at or after " + q + ", and it started by " + q + ", so it contains " + q + ". Expired ones buried below can wait: only the top is read." : "The heap is empty: no started interval reaches " + q + "."}
    while (heap.size && heap.peek()![1] < q) heap.pop();
    // @why The top of the heap is the smallest interval covering `q`, or -1 if the heap is empty.
    // @say {heap.data.length ? "The smallest interval containing " + q + " has size " + heap.data[0][0] + "." : "Nothing contains " + q + ", so its answer is -1."}
    const best = heap.size ? heap.peek()![0] : -1; // @ask best // @moment query {q}
    // @why Remember the answer for this query.
    // @say Store {q} → {best}. The queries were answered in sorted order, so the map puts them back in the original order at the end.
    answer.set(q, best);
  }
  // @why Return the answers in the original query order.
  // @phase Answer
  // @returns {JSON.stringify(queries.map((x) => answer.get(x)))}: each answer in the original query order. Each interval entered and left the heap at most once, so the work is dominated by the sorts.
  return queries.map((q) => answer.get(q)!);
}

test("1851. Minimum Interval to Include Each Query", () => {
  assert.deepEqual(minInterval([[1, 4], [2, 4], [3, 6], [4, 4]], [2, 3, 4, 5]), [3, 3, 1, 4]);
  assert.deepEqual(minInterval([[2, 3], [2, 5], [1, 8], [20, 25]], [2, 19, 5, 22]), [2, -1, 4, 6]);
  assert.deepEqual(minInterval([[5, 5]], [1, 5, 5, 9]), [-1, 1, 1, -1]);
});
