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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findOrder(numCourses: number, prerequisites: number[][]): number[] {
  const pre: number[][] = Array.from({ length: numCourses }, () => []);
  for (const [course, req] of prerequisites) pre[course].push(req);

  const output: number[] = [];
  const visited = new Set<number>(); // fully processed
  const onPath = new Set<number>(); // in current DFS path

  const dfs = (course: number): boolean => {
    if (onPath.has(course)) return false;
    if (visited.has(course)) return true;
    onPath.add(course);
    for (const req of pre[course]) if (!dfs(req)) return false;
    onPath.delete(course);
    visited.add(course);
    output.push(course);
    return true;
  };

  for (let c = 0; c < numCourses; c++) if (!dfs(c)) return [];
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
