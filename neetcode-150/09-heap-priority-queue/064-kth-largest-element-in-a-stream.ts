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

export class KthLargest {
  private k: number;
  private heap = new Heap<number>((a, b) => a - b);

  constructor(k: number, nums: number[]) {
    this.k = k;
    for (const n of nums) this.add(n);
  }

  add(val: number): number {
    this.heap.push(val);
    if (this.heap.size() > this.k) this.heap.pop();
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
