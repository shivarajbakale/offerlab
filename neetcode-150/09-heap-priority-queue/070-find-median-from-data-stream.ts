/**
 * 295. Find Median from Data Stream
 * Difficulty: Hard
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/find-median-from-data-stream/
 *
 * The median is the middle value of a sorted list; for an even-sized list it
 * is the mean of the two middle values. Implement a `MedianFinder` class:
 *   - addNum(num): add an integer from the stream.
 *   - findMedian(): return the median of all numbers added so far.
 *
 * Example 1:
 *   Input:  ["MedianFinder", "addNum", "addNum", "findMedian", "addNum",
 *            "findMedian"]
 *           [[], [1], [2], [], [3], []]
 *   Output: [null, null, null, 1.5, null, 2.0]
 *
 * Constraints:
 *   -10^5 <= num <= 10^5
 *   findMedian is only called after at least one addNum
 *   At most 5 * 10^4 calls in total
 *
 * Approach: Two heaps
 *   `small` is a max-heap holding the lower half, `large` a min-heap holding
 *   the upper half. Always push into `small`, then move its max to `large`
 *   so every element of small <= every element of large. Rebalance so that
 *   small has the same size as large or exactly one more. The median is the
 *   top of small (odd count) or the mean of both tops (even count).
 *
 * Time: addNum O(log n), findMedian O(1)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

class Heap<T> {
  private data: T[] = [];
  private cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number) {
    this.cmp = cmp;
  }

  size(): number {
    return this.data.length;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  push(val: T): void {
    const d = this.data;
    d.push(val);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(d[i], d[p]) >= 0) break;
      [d[i], d[p]] = [d[p], d[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < d.length && this.cmp(d[l], d[best]) < 0) best = l;
        if (r < d.length && this.cmp(d[r], d[best]) < 0) best = r;
        if (best === i) break;
        [d[i], d[best]] = [d[best], d[i]];
        i = best;
      }
    }
    return top;
  }
}

export class MedianFinder {
  private small = new Heap<number>((a, b) => b - a); // max-heap, lower half
  private large = new Heap<number>((a, b) => a - b); // min-heap, upper half

  addNum(num: number): void {
    this.small.push(num);
    this.large.push(this.small.pop()!);
    if (this.large.size() > this.small.size()) {
      this.small.push(this.large.pop()!);
    }
  }

  findMedian(): number {
    if (this.small.size() > this.large.size()) return this.small.peek()!;
    return (this.small.peek()! + this.large.peek()!) / 2;
  }
}

test("295. Find Median from Data Stream", () => {
  const m = new MedianFinder();
  m.addNum(1);
  m.addNum(2);
  assert.equal(m.findMedian(), 1.5);
  m.addNum(3);
  assert.equal(m.findMedian(), 2);

  // Single element and descending / negative input
  const n = new MedianFinder();
  n.addNum(-1);
  assert.equal(n.findMedian(), -1);
  for (const x of [-2, -3, -4, -5]) n.addNum(x);
  assert.equal(n.findMedian(), -3);
});
