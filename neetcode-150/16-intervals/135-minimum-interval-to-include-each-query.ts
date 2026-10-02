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
class MinHeap<T extends number[]> {
  private data: T[] = [];

  get size(): number {
    return this.data.length;
  }

  peek(): T | undefined {
    return this.data[0];
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

export function minInterval(intervals: number[][], queries: number[]): number[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const heap = new MinHeap<[number, number]>(); // [size, right]
  const answer = new Map<number, number>();
  let i = 0;

  for (const q of [...queries].sort((a, b) => a - b)) {
    while (i < sorted.length && sorted[i][0] <= q) {
      const [l, r] = sorted[i++];
      heap.push([r - l + 1, r]);
    }
    while (heap.size && heap.peek()![1] < q) heap.pop();
    answer.set(q, heap.size ? heap.peek()![0] : -1);
  }
  return queries.map((q) => answer.get(q)!);
}

test("1851. Minimum Interval to Include Each Query", () => {
  assert.deepEqual(minInterval([[1, 4], [2, 4], [3, 6], [4, 4]], [2, 3, 4, 5]), [3, 3, 1, 4]);
  assert.deepEqual(minInterval([[2, 3], [2, 5], [1, 8], [20, 25]], [2, 19, 5, 22]), [2, -1, 4, 6]);
  assert.deepEqual(minInterval([[5, 5]], [1, 5, 5, 9]), [-1, 1, 1, -1]);
});
