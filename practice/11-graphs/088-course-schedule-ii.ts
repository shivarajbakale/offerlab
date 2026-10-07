/**
 * 210. Course Schedule II
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/course-schedule-ii/
 *
 * There are `numCourses` courses labeled 0..numCourses-1, and
 * prerequisites[i] = [a, b] means course b must be taken before course a.
 * Return any valid order in which to take all courses. If it is impossible
 * (there is a cycle), return an empty array.
 *
 * Example 1:
 *   Input: numCourses = 2, prerequisites = [[1,0]]
 *   Output: [0,1]
 *
 * Example 2:
 *   Input: numCourses = 4, prerequisites = [[1,0],[2,0],[3,1],[3,2]]
 *   Output: [0,2,1,3]  (or [0,1,2,3])
 *
 * Example 3:
 *   Input: numCourses = 1, prerequisites = []
 *   Output: [0]
 *
 * Constraints:
 *   1 <= numCourses <= 2000
 *   0 <= prerequisites.length <= numCourses * (numCourses - 1)
 *   All pairs are distinct
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findOrder(numCourses: number, prerequisites: number[][]): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

function isValidOrder(n: number, prereqs: number[][], order: number[]): boolean {
  if (order.length !== n || new Set(order).size !== n) return false;
  const pos = new Map(order.map((c, i) => [c, i]));
  return prereqs.every(([a, b]) => pos.get(b)! < pos.get(a)!);
}

test("210. Course Schedule II", () => {
  assert.deepEqual(findOrder(2, [[1, 0]]), [0, 1]);
  const p2 = [[1, 0], [2, 0], [3, 1], [3, 2]];
  assert.ok(isValidOrder(4, p2, findOrder(4, p2)));
  assert.deepEqual(findOrder(1, []), [0]);
  assert.deepEqual(findOrder(2, [[1, 0], [0, 1]]), []);
});
