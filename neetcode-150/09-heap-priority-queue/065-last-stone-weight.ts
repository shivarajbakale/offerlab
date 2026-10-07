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

// @rule the heap holds every stone still left, heaviest on top
// @why Smash the two heaviest stones repeatedly; return the weight left, or 0.
// @goal smashing the two heaviest of {JSON.stringify(stones)} again and again, what weight is left at the end?
export function lastStoneWeight(stones: number[]): number {
  // @why A max-heap, so the heaviest stone is always on top.
  // @phase Setup: heaviest stone always on top
  // @say Re-sorting the stones after every smash costs n log n per round. A max-heap hands over the heaviest stone in O(log n) and takes the leftover back just as fast.
  const heap = new Heap<number>((a, b) => b - a); // max-heap
  // @why Load every stone into the heap.
  // @say Load all {stones.length} stones; the heap keeps the heaviest at the top as they go in.
  // @then {heap.data.length} of {stones.length} stones loaded, heaviest on top: {heap.data[0]}.
  for (const s of stones) heap.push(s);
  // @why Smash while at least two stones remain.
  // @phase Smash the two heaviest
  // @yes {heap.data.length} stones remain, so there is still a pair to smash.
  // @no {heap.data.length === 1 ? "Only a stone of weight " + heap.data[0] + " is left, with nothing to hit" : "No stones are left: the last pair destroyed each other"}, so the game is over.
  // @say {heap.data.length > 1 ? heap.data.length + " stones remain, so there is still a pair to smash." : heap.data.length === 1 ? "Only a stone of weight " + heap.data[0] + " is left, with nothing to hit, so the game is over." : "No stones are left: the last pair destroyed each other, so the game is over."}
  while (heap.size() > 1) {
    // @why The heaviest stone.
    // @say Take the heaviest stone, {heap.data[0]}, off the top.
    const y = heap.pop()!; // @ask y
    // @why The second heaviest stone.
    // @say The next top, {heap.data[0]}, is the second heaviest. The rules always smash these two, so no other pair needs checking.
    const x = heap.pop()!;
    // @why Equal stones destroy each other; otherwise a stone of the difference is left.
    // @yes {y} beats {x}: a stone of {y} − {x} = {y - x} survives and goes back in the heap, where it may be heaviest again later.
    // @no Both weigh {y}, so both are destroyed and nothing goes back.
    // @say {y !== x ? y + " beats " + x + ": a stone of " + y + " − " + x + " = " + (y - x) + " survives and goes back in the heap, where it may be heaviest again later." : "Both weigh " + y + ", so both are destroyed and nothing goes back."}
    // @then {heap.data.length} {heap.data.length === 1 ? "stone remains" : "stones remain"}.
    if (y !== x) heap.push(y - x); // @ask heap.data.length // @moment smash {y} vs {x}
  }
  // @why Return the last stone, or 0 if none are left.
  // @phase Answer
  // @returns {heap.data.length ? heap.data[0] + ": the one stone that never found a partner" : "0: every stone was destroyed"}. Each round cost O(log n), so O(n log n) overall.
  return heap.peek() ?? 0;
}

test("1046. Last Stone Weight", () => {
  assert.equal(lastStoneWeight([2, 7, 4, 1, 8, 1]), 1);
  assert.equal(lastStoneWeight([1]), 1);
  assert.equal(lastStoneWeight([3, 3]), 0);
});
