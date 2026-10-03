/**
 * 703. Kth Largest Element in a Stream
 * Difficulty: Easy
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/kth-largest-element-in-a-stream/
 *
 * Design a class that finds the kth largest element in a stream of numbers
 * (kth largest in sorted order, not kth distinct). `KthLargest(k, nums)`
 * initialises the object with `k` and an initial array of numbers.
 * `add(val)` appends `val` to the stream and returns the current kth
 * largest element.
 *
 * Example 1:
 *   Input:  ["KthLargest", "add", "add", "add", "add", "add"]
 *           [[3, [4, 5, 8, 2]], [3], [5], [10], [9], [4]]
 *   Output: [null, 4, 5, 5, 8, 8]
 *
 * Example 2:
 *   Input:  ["KthLargest", "add", "add", "add", "add"]
 *           [[4, [7, 7, 7, 7, 8, 3]], [2], [10], [9], [9]]
 *   Output: [null, 7, 7, 7, 8]
 *
 * Constraints:
 *   0 <= nums.length <= 10^4
 *   1 <= k <= nums.length + 1
 *   -10^4 <= nums[i], val <= 10^4
 *   At most 10^4 calls to add
 *
 * Approach: Min-heap of size k
 *   Keep only the k largest values in a min-heap. Its root is then the kth
 *   largest. On each add, push and evict the minimum if the heap exceeds k.
 *
 * Time: O(n log k) init, O(log k) per add   Space: O(k)
 *
 * Pattern: heap-top-k
 * Key insight: Only the k largest values can ever be the answer, so a min-heap of size k
 *   is enough; its root is the k-th largest, and each new value either replaces the root
 *   or is ignored.
 * Real world: Live leaderboards and monitoring that track the k-th highest score or
 *   latency as events stream in, without storing every event.
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

// @why Tracks the k-th largest number as new numbers arrive.
export class KthLargest {
  // @why How many top numbers we keep.
  private k: number;
  // @why A min-heap holding only the k largest numbers; its top is the k-th largest.
  private heap = new Heap<number>((a, b) => a - b);

  // @why Start with an initial list of numbers.
  constructor(k: number, nums: number[]) {
    // @why Remember k.
    this.k = k;
    // @why Feed the starting numbers through `add` so the heap holds the top k.
    for (const n of nums) this.add(n);
  }

  // @why Add a number and return the current k-th largest.
  add(val: number): number {
    // @why Add the new number to the heap.
    this.heap.push(val);
    // @why Too many kept: drop the smallest, since it can't be in the top k.
    if (this.heap.size() > this.k) this.heap.pop();
    // @why The smallest of the top k is the k-th largest.
    return this.heap.peek()!;
  }
}

test("703. Kth Largest Element in a Stream", () => {
  const a = new KthLargest(3, [4, 5, 8, 2]);
  assert.deepEqual([3, 5, 10, 9, 4].map((v) => a.add(v)), [4, 5, 5, 8, 8]);

  const b = new KthLargest(4, [7, 7, 7, 7, 8, 3]);
  assert.deepEqual([2, 10, 9, 9].map((v) => b.add(v)), [7, 7, 7, 8]);

  // Empty initial stream
  const c = new KthLargest(1, []);
  assert.deepEqual([-3, -2, -4, 0, 4].map((v) => c.add(v)), [-3, -2, -2, 0, 4]);
});
