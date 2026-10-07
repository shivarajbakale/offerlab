/**
 * 621. Task Scheduler
 * Difficulty: Medium
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/task-scheduler/
 *
 * You are given an array of CPU `tasks`, each labelled with an uppercase
 * letter, and a cooling interval `n`. Each CPU cycle can run one task or sit
 * idle. Two runs of the same task must be separated by at least `n` cycles.
 * Return the minimum number of cycles needed to finish all tasks.
 *
 * Example 1:
 *   Input: tasks = ["A","A","A","B","B","B"], n = 2
 *   Output: 8   (A -> B -> idle -> A -> B -> idle -> A -> B)
 *
 * Example 2:
 *   Input: tasks = ["A","C","A","B","D","B"], n = 1
 *   Output: 6
 *
 * Example 3:
 *   Input: tasks = ["A","A","A","B","B","B"], n = 3
 *   Output: 10
 *
 * Constraints:
 *   1 <= tasks.length <= 10^4
 *   tasks[i] is an uppercase English letter
 *   0 <= n <= 100
 *
 * Approach: Max-heap + cooldown queue
 *   Greedily run the task with the most remaining copies. A max-heap holds
 *   remaining counts of ready tasks; a FIFO queue holds [count, readyTime]
 *   for tasks cooling down. Each tick: pop the heap (if non-empty), decrement
 *   and enqueue it with readyTime = time + n; then move any task whose
 *   readyTime has arrived back into the heap. If the heap is empty, jump
 *   time forward to the next ready task.
 *
 * Time: O(m) where m = total cycles (heap size <= 26)   Space: O(1)
 *
 * Pattern: heap-top-k,greedy
 * Key insight: Idle time comes from the most frequent task, so always running the task
 *   with the most copies left keeps idle slots minimal. A cooldown queue returns a task
 *   to the heap exactly when it may run again.
 * Real world: CPU and job schedulers that enforce a cooldown or rate limit per job type
 *   while keeping the processor busy with the most backlogged work.
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

// @rule heap holds counts of tasks ready now; queue holds tasks cooling until their time
// @why Fewest time units to run all tasks, with `n` units of cooldown between equal tasks.
export function leastInterval(tasks: string[], n: number): number {
  // @why How many times each task appears.
  const counts = new Map<string, number>();
  // @why Count each task.
  for (const t of tasks) counts.set(t, (counts.get(t) ?? 0) + 1);

  // @why A max-heap of counts; always run the task with the most work left.
  const heap = new Heap<number>((a, b) => b - a); // max-heap of counts
  // @why Only counts matter, not task names.
  for (const c of counts.values()) heap.push(c);

  // @why Tasks cooling down, with the time they can run again.
  const queue: [number, number][] = []; // [remaining count, ready time]
  // @why Front of the cooldown queue (an index, so no slow shifting).
  let head = 0;
  // @why The current time unit.
  let time = 0;

  // @why Keep going while any task is ready or cooling down.
  while (heap.size() > 0 || head < queue.length) {
    // @why One time unit passes.
    time++;
    // @why If a task is ready, run the one with the most left.
    if (heap.size() > 0) {
      // @why Run it once, so one less remains.
      const cnt = heap.pop()! - 1; // @ask cnt
      // @why If more remain, park it until the cooldown ends.
      if (cnt > 0) queue.push([cnt, time + n]);
    // @why Nothing is ready, so we would sit idle.
    } else {
      // @why Skip straight to when the next task is ready instead of ticking.
      time = queue[head][1]; // idle until the next task is ready // @ask time // @moment idle until {queue[head][1]}
    }
    // @why If the oldest cooling task is ready now, move it back to the heap.
    if (head < queue.length && queue[head][1] === time) {
      // @why Put it back into the heap to be picked again.
      heap.push(queue[head++][0]); // @moment task back from cooldown at {time}
    }
  }
  // @why The total time units used.
  return time;
}

test("621. Task Scheduler", () => {
  assert.equal(leastInterval(["A", "A", "A", "B", "B", "B"], 2), 8);
  assert.equal(leastInterval(["A", "C", "A", "B", "D", "B"], 1), 6);
  assert.equal(leastInterval(["A", "A", "A", "B", "B", "B"], 3), 10);
  // No cooldown: just the number of tasks
  assert.equal(leastInterval(["A", "A", "A"], 0), 3);
  assert.equal(leastInterval(["A", "A", "A", "A", "B", "C"], 2), 10);
});
