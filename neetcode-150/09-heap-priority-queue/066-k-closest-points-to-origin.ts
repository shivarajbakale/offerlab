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

  toArray(): T[] {
    return [...this.data];
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

export function kClosest(points: number[][], k: number): number[][] {
  const dist = (p: number[]) => p[0] * p[0] + p[1] * p[1];
  const heap = new Heap<number[]>((a, b) => dist(b) - dist(a)); // max-heap
  for (const p of points) {
    heap.push(p);
    if (heap.size() > k) heap.pop();
  }
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
