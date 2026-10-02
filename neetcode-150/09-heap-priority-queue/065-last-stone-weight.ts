/**
 * 1046. Last Stone Weight
 * Difficulty: Easy
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/last-stone-weight/
 *
 * You are given an array `stones` of positive integer weights. Each turn,
 * take the two heaviest stones x <= y and smash them together: if x == y
 * both are destroyed, otherwise x is destroyed and y becomes y - x.
 * Repeat until at most one stone remains. Return the weight of the last
 * stone, or 0 if none remain.
 *
 * Example 1:
 *   Input: stones = [2, 7, 4, 1, 8, 1]
 *   Output: 1
 *
 * Example 2:
 *   Input: stones = [1]
 *   Output: 1
 *
 * Constraints:
 *   1 <= stones.length <= 30
 *   1 <= stones[i] <= 1000
 *
 * Approach: Max-heap simulation
 *   Put every stone in a max-heap. Repeatedly pop the two largest, push back
 *   their difference if non-zero. The remaining root (or 0) is the answer.
 *
 * Time: O(n log n)   Space: O(n)
 *
 * Pattern: heap-top-k
 * Key insight: Each round needs the two heaviest stones from a changing set, which is
 *   exactly what a max-heap gives in O(log n) instead of re-sorting every round.
 * Real world: Huffman coding repeatedly pulls the two extreme weights from a heap and
 *   pushes back their combination, the same smash-and-reinsert loop.
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

export function lastStoneWeight(stones: number[]): number {
  const heap = new Heap<number>((a, b) => b - a); // max-heap
  for (const s of stones) heap.push(s);
  while (heap.size() > 1) {
    const y = heap.pop()!;
    const x = heap.pop()!;
    if (y !== x) heap.push(y - x);
  }
  return heap.peek() ?? 0;
}

test("1046. Last Stone Weight", () => {
  assert.equal(lastStoneWeight([2, 7, 4, 1, 8, 1]), 1);
  assert.equal(lastStoneWeight([1]), 1);
  assert.equal(lastStoneWeight([3, 3]), 0);
});
