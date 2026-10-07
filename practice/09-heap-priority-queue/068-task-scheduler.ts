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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export function leastInterval(tasks: string[], n: number): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("621. Task Scheduler", () => {
  assert.equal(leastInterval(["A", "A", "A", "B", "B", "B"], 2), 8);
  assert.equal(leastInterval(["A", "C", "A", "B", "D", "B"], 1), 6);
  assert.equal(leastInterval(["A", "A", "A", "B", "B", "B"], 3), 10);
  // No cooldown: just the number of tasks
  assert.equal(leastInterval(["A", "A", "A"], 0), 3);
  assert.equal(leastInterval(["A", "A", "A", "A", "B", "C"], 2), 10);
});
