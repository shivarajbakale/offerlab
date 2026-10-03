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
 *
 * Approach: DFS topological sort with three states
 *   Each course is unvisited, on the current path ("cycle"), or done
 *   ("visit"). DFS into prerequisites first; after all of them finish,
 *   append the course to the output. Revisiting a course on the current
 *   path means a cycle -> return [].
 *
 * Time: O(V + E)   Space: O(V + E)
 *
 * Pattern: topological-sort, graph-dfs
 * Key insight: A course is appended only after all its prerequisites have been appended,
 *   so DFS post-order is already a valid order. The separate on-path set catches cycles,
 *   while the visited set skips courses already placed.
 * Real world: Make or a task runner computing the order in which to build targets so
 *   every dependency is built before the things that need it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Returns a valid order to take all courses, or [] if there is a cycle.
export function findOrder(numCourses: number, prerequisites: number[][]): number[] {
  // @why `pre[c]` lists the courses that must be done before course `c`.
  const pre: number[][] = Array.from({ length: numCourses }, () => []);
  // @why Fill in the prerequisite list from the input pairs.
  for (const [course, req] of prerequisites) pre[course].push(req);

  // @why The finished order; a course is added only after all its prerequisites.
  const output: number[] = [];
  // @why Courses fully handled; they need no more work.
  const visited = new Set<number>(); // fully processed
  // @why Courses on the current DFS path; meeting one again means a cycle.
  const onPath = new Set<number>(); // in current DFS path

  // @why Returns false if a cycle is found below this course.
  const dfs = (course: number): boolean => {
    // @why Back on our own path means a cycle, so no valid order exists.
    if (onPath.has(course)) return false;
    // @why Already finished earlier, so skip it.
    if (visited.has(course)) return true;
    // @why Mark this course as on the current path.
    onPath.add(course);
    // @why Handle all prerequisites first.
    for (const req of pre[course]) if (!dfs(req)) return false;
    // @why Leaving this path.
    onPath.delete(course);
    // @why This course is completely done.
    visited.add(course);
    // @why All prerequisites are already in `output`, so this course can go next.
    output.push(course);
    // @why No cycle below this course.
    return true;
  };

  // @why Run DFS from every course, since the graph may be disconnected.
  for (let c = 0; c < numCourses; c++) if (!dfs(c)) return [];
  // @why A valid order, built in prerequisite-first order.
  return output;
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
