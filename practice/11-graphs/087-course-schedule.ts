/**
 * 207. Course Schedule
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/course-schedule/
 *
 * There are `numCourses` courses labeled 0..numCourses-1. Each pair
 * prerequisites[i] = [a, b] means you must take course b before course a.
 * Return true if it is possible to finish all courses, otherwise false.
 *
 * Example 1:
 *   Input: numCourses = 2, prerequisites = [[1,0]]
 *   Output: true
 *
 * Example 2:
 *   Input: numCourses = 2, prerequisites = [[1,0],[0,1]]
 *   Output: false
 *   Explanation: Courses 0 and 1 depend on each other (a cycle).
 *
 * Constraints:
 *   1 <= numCourses <= 2000
 *   0 <= prerequisites.length <= 5000
 *   All pairs are unique
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("207. Course Schedule", () => {
  assert.equal(canFinish(2, [[1, 0]]), true);
  assert.equal(canFinish(2, [[1, 0], [0, 1]]), false);
  assert.equal(canFinish(1, []), true);
  assert.equal(canFinish(5, [[1, 4], [2, 4], [3, 1], [3, 2]]), true);
  assert.equal(canFinish(3, [[0, 1], [1, 2], [2, 0]]), false);
});
