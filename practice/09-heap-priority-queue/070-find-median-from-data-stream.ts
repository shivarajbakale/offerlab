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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export class MedianFinder {
  addNum(num: number): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  findMedian(): number {
    // TODO: implement
    throw new Error("Not implemented");
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
