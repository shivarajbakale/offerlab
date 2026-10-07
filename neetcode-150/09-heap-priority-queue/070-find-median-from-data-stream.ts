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
 *
 * Pattern: two-heaps
 * Key insight: The median only depends on the boundary between the lower and upper
 *   halves. A max-heap for the lower half and a min-heap for the upper half expose both
 *   boundary values in O(1), and each insert only needs O(log n) rebalancing.
 * Real world: Monitoring systems reporting a running median latency, and trading systems
 *   tracking the median price of a live stream of trades.
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

// @rule small holds the lower half, large the upper; small has the same size or one more
// @why Keeps a running median by splitting the numbers into a lower and an upper half.
export class MedianFinder {
  // @why Max-heap of the smaller half; its top is the biggest of the small numbers.
  private small = new Heap<number>((a, b) => b - a); // max-heap, lower half
  // @why Min-heap of the larger half; its top is the smallest of the big numbers.
  private large = new Heap<number>((a, b) => a - b); // min-heap, upper half

  // @why Add a number while keeping the halves balanced.
  addNum(num: number): void {
    // @why Put the number in the lower half first.
    this.small.push(num);
    // @why Move the lower half's biggest to the upper half, so every lower number is at most every upper number.
    this.large.push(this.small.pop()!); // @ask this.large.data[0]
    // @why Keep the lower half the same size or one bigger.
    if (this.large.size() > this.small.size()) {
      // @why Move the smallest upper number back down to rebalance.
      this.small.push(this.large.pop()!); // @ask this.small.data.length
    }
  }

  // @why The median sits at the middle of the two halves.
  findMedian(): number {
    // @why Odd count: the extra item in the lower half is the middle.
    if (this.small.size() > this.large.size()) return this.small.peek()!;
    // @why Even count: average the two middle numbers.
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
