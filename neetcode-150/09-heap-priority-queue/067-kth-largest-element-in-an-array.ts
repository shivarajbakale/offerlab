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

export function findKthLargest(nums: number[], k: number): number {
  const heap = new Heap<number>((a, b) => a - b); // min-heap
  for (const n of nums) {
    heap.push(n);
    if (heap.size() > k) heap.pop();
  }
  return heap.peek()!;
}

test("215. Kth Largest Element in an Array", () => {
  assert.equal(findKthLargest([3, 2, 1, 5, 6, 4], 2), 5);
  assert.equal(findKthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4), 4);
  assert.equal(findKthLargest([1], 1), 1);
  assert.equal(findKthLargest([-1, -1, -2], 3), -2);
});
