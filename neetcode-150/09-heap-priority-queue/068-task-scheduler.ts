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

export function leastInterval(tasks: string[], n: number): number {
  const counts = new Map<string, number>();
  for (const t of tasks) counts.set(t, (counts.get(t) ?? 0) + 1);

  const heap = new Heap<number>((a, b) => b - a); // max-heap of counts
  for (const c of counts.values()) heap.push(c);

  const queue: [number, number][] = []; // [remaining count, ready time]
  let head = 0;
  let time = 0;

  while (heap.size() > 0 || head < queue.length) {
    time++;
    if (heap.size() > 0) {
      const cnt = heap.pop()! - 1;
      if (cnt > 0) queue.push([cnt, time + n]);
    } else {
      time = queue[head][1]; // idle until the next task is ready
    }
    if (head < queue.length && queue[head][1] === time) {
      heap.push(queue[head++][0]);
    }
  }
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
