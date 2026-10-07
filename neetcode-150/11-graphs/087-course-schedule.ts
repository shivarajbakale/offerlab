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
 *
 * Pattern: topological-sort, graph-dfs
 * Key insight: The courses can all be finished exactly when the prerequisite graph has no
 *   cycle, so the problem reduces to cycle detection. Clearing a course's prerequisite
 *   list once it is proven doable memoizes the result, so each course is explored only
 *   once.
 * Real world: Build systems and package managers (npm, Bazel) rejecting a dependency
 *   graph that contains a circular dependency before starting any work.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule following prerequisites never leads back to a course in visiting (no cycle)
// @why Returns true if every course can be taken, meaning the prerequisites have no cycle.
export function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  // @why `pre[c]` lists the courses that must be done before course `c`.
  const pre: number[][] = Array.from({ length: numCourses }, () => []);
  // @why Fill in the prerequisite list from the input pairs.
  for (const [course, req] of prerequisites) pre[course].push(req);

  // @why Courses on the current DFS path; meeting one again means a cycle.
  const visiting = new Set<number>();

  // @why Returns true if this course can be completed.
  const dfs = (course: number): boolean => {
    // @why Cycle found: the course needs itself, so it can never be taken.
    if (visiting.has(course)) return false; // @broken // @say Reaching a course already on our path means a cycle
    // @why No prerequisites left, so the course is takeable.
    if (pre[course].length === 0) return true; // @say A course with no prereqs left can always be taken
    // @why Mark this course as on the current path.
    visiting.add(course); // @ask visiting.size // @say Mark {course} as on the current DFS path
    // @why Every prerequisite must itself be completable.
    for (const req of pre[course]) if (!dfs(req)) return false; // @say Course {course} is only doable if every prereq is
    // @why Done with this path, so remove it; another path may legally reach it later.
    visiting.delete(course);
    // @why Remember it is fine, so later visits return instantly.
    pre[course] = []; // @moment course {course} can be taken // @say Memoize: {course} is completable, so skip it next time
    // @why Every prerequisite checked out.
    return true;
  };

  // @why Run DFS from every course, since the graph may be disconnected.
  for (let c = 0; c < numCourses; c++) if (!dfs(c)) return false;
  // @why No cycle anywhere, so all courses can be finished.
  return true;
}

test("207. Course Schedule", () => {
  assert.equal(canFinish(2, [[1, 0]]), true);
  assert.equal(canFinish(2, [[1, 0], [0, 1]]), false);
  assert.equal(canFinish(1, []), true);
  assert.equal(canFinish(5, [[1, 4], [2, 4], [3, 1], [3, 2]]), true);
  assert.equal(canFinish(3, [[0, 1], [1, 2], [2, 0]]), false);
});
