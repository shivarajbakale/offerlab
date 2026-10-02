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
 *
 * Approach: DFS cycle detection
 *   Build course -> prerequisites adjacency. DFS each course, tracking the
 *   current path in a "visiting" set. Reaching a course already on the path
 *   means a cycle. Once a course is proven completable, clear its prereq
 *   list so later visits return immediately.
 *
 * Time: O(V + E)   Space: O(V + E)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  const pre: number[][] = Array.from({ length: numCourses }, () => []);
  for (const [course, req] of prerequisites) pre[course].push(req);

  const visiting = new Set<number>();

  const dfs = (course: number): boolean => {
    if (visiting.has(course)) return false;
    if (pre[course].length === 0) return true;
    visiting.add(course);
    for (const req of pre[course]) if (!dfs(req)) return false;
    visiting.delete(course);
    pre[course] = []; // memoize: this course is completable
    return true;
  };

  for (let c = 0; c < numCourses; c++) if (!dfs(c)) return false;
  return true;
}

test("207. Course Schedule", () => {
  assert.equal(canFinish(2, [[1, 0]]), true);
  assert.equal(canFinish(2, [[1, 0], [0, 1]]), false);
  assert.equal(canFinish(1, []), true);
  assert.equal(canFinish(5, [[1, 4], [2, 4], [3, 1], [3, 2]]), true);
  assert.equal(canFinish(3, [[0, 1], [1, 2], [2, 0]]), false);
});
