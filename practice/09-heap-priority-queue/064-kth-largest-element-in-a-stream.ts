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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export class KthLargest {
  constructor(k: number, nums: number[]) {
    // TODO: set up your data structures
  }

  add(val: number): number {
    // TODO: implement
    throw new Error("Not implemented");
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
