/**
 * 215. Kth Largest Element in an Array
 * Difficulty: Medium
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/kth-largest-element-in-an-array/
 *
 * Given an integer array `nums` and an integer `k`, return the kth largest
 * element in the array (in sorted order, not the kth distinct element).
 * Try to solve it without sorting.
 *
 * Example 1:
 *   Input: nums = [3, 2, 1, 5, 6, 4], k = 2
 *   Output: 5
 *
 * Example 2:
 *   Input: nums = [3, 2, 3, 1, 2, 4, 5, 5, 6], k = 4
 *   Output: 4
 *
 * Constraints:
 *   1 <= k <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 *
 * Approach: Min-heap of size k
 *   Maintain the k largest elements seen in a min-heap; whenever it exceeds
 *   size k, drop the smallest. After one pass the root is the kth largest.
 *   (Quickselect gives O(n) average but O(n^2) worst case.)
 *
 * Time: O(n log k)   Space: O(k)
 *
 * Pattern: heap-top-k
 * Key insight: Sorting all n values is unnecessary; a min-heap holding the k largest seen
 *   so far drops anything smaller than its root, so after one pass the root is the k-th
 *   largest in O(n log k).
 * Real world: Analytics queries such as 'the 95th-percentile-ranked item' or 'top-k
 *   products by sales' computed in one pass over a large table.
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

// @rule the heap holds the k largest numbers seen so far; its top is the kth largest
// @why Return the k-th largest number in the array.
// @goal what is the k-th largest number (k = {k}) in {JSON.stringify(nums)}?
export function findKthLargest(nums: number[], k: number): number {
  // @why A min-heap that keeps only the k largest numbers seen.
  // @phase Setup: a min-heap that holds at most k numbers
  // @say Sorting all {nums.length} numbers costs n log n, and orders far more than needed. Only the {k} largest matter, so keep just those in a min-heap: its top, the smallest of them, is the answer, and each number costs O(log k).
  const heap = new Heap<number>((a, b) => a - b); // min-heap
  // @why Look at each number once.
  // @phase Each number: add it, then drop the smallest if over k
  // @say Next number: {n}.
  for (const n of nums) {
    // @why Add the number to the heap.
    // @say Add {n} to the kept numbers. It may beat one of them; the heap sorts that out in O(log k).
    // @then Kept: {JSON.stringify(heap.data)}, smallest on top: {heap.data[0]}.
    heap.push(n);
    // @why Over k items: drop the smallest, so only the top k stay.
    // @yes {heap.data.length} kept but only {k} wanted. The smallest, {heap.data[0]}, already has {k} numbers at least as large, so it can never be the k-th largest: drop it.
    // @no {heap.data.length === k ? "Exactly " + k + " kept, so nothing to drop" : "Only " + heap.data.length + " of " + k + " spots filled so far, so keep everything for now"}.
    // @say {heap.data.length > k ? heap.data.length + " kept but only " + k + " wanted. The smallest, " + heap.data[0] + ", already has " + k + " numbers at least as large, so it can never be the k-th largest: drop it." : heap.data.length === k ? "Exactly " + k + " kept, so nothing to drop yet." : "Only " + heap.data.length + " of " + k + " spots filled so far, so keep everything for now."}
    if (heap.size() > k) heap.pop(); // @ask heap.data[0]
  }
  // @why The smallest of the top k is the k-th largest.
  // @phase Answer
  // @say The heap holds the {k} largest numbers, {JSON.stringify(heap.data)}. Its top is the smallest of them.
  // @returns {heap.data[0]}: exactly {k - 1} kept {k - 1 === 1 ? "number ranks" : "numbers rank"} above it, so it is the k-th largest. O(n log k), no full sort.
  return heap.peek()!;
}

test("215. Kth Largest Element in an Array", () => {
  assert.equal(findKthLargest([3, 2, 1, 5, 6, 4], 2), 5);
  assert.equal(findKthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4), 4);
  assert.equal(findKthLargest([1], 1), 1);
  assert.equal(findKthLargest([-1, -1, -2], 3), -2);
});
