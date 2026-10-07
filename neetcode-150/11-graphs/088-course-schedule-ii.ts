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

// @rule every course in output comes after all of its prerequisites
// @why Returns a valid order to take all courses, or [] if there is a cycle.
// @goal in what order can all {numCourses} courses be taken, given prerequisites {JSON.stringify(prerequisites)}?
export function findOrder(numCourses: number, prerequisites: number[][]): number[] {
  // @why `pre[c]` lists the courses that must be done before course `c`.
  // @phase Setup: who needs whom
  // @say Trying orders until one works is n! work. Instead, list a course only after all of its prerequisites are listed: a depth-first walk that finishes the prerequisites first produces exactly that order.
  const pre: number[][] = Array.from({ length: numCourses }, () => []);
  // @why Fill in the prerequisite list from the input pairs.
  // @say Record each pair as "course → what it needs", so a walk from a course follows its prerequisites.
  // @then Prerequisites per course: {JSON.stringify(pre)}.
  for (const [course, req] of prerequisites) pre[course].push(req);

  // @why The finished order; a course is added only after all its prerequisites.
  // @say Three kinds of course: placed in the order already (`visited`), being worked on right now (`onPath`), and untouched. Telling the first two apart is what separates a shared prerequisite from a cycle.
  const output: number[] = [];
  // @why Courses fully handled; they need no more work.
  const visited = new Set<number>(); // fully processed
  // @why Courses on the current DFS path; meeting one again means a cycle.
  const onPath = new Set<number>(); // in current DFS path

  // @why Returns false if a cycle is found below this course.
  // @phase Place prerequisites first, then the course
  // @goal can course {course} be placed after all its prerequisites{onPath.size ? ", while placing " + [...onPath].join(" → ") : ""}?
  const dfs = (course: number): boolean => {
    // @why Back on our own path means a cycle, so no valid order exists.
    // @yes Course {course} is already being worked on ({[...onPath].join(" → ")}). Its prerequisites lead back to it, so it would have to come before itself: a cycle.
    // @no Course {course} is not on the current chain.
    // @returns false: a cycle means no order can work.
    if (onPath.has(course)) return false;
    // @why Already finished earlier, so skip it.
    // @yes Course {course} is already placed, along with everything it needs. Nothing more to do.
    // @no Course {course} is not placed yet.
    // @returns true: course {course} is already in the order.
    if (visited.has(course)) return true;
    // @why Mark this course as on the current path.
    // @say Mark course {course} as in progress. If a prerequisite chain leads back to it before it is placed, that is a cycle.
    onPath.add(course); // @ask onPath.size
    // @why Handle all prerequisites first.
    // @say {pre[course].length ? "Place every prerequisite of " + course + " (" + JSON.stringify(pre[course]) + ") before " + course + " itself." : "Course " + course + " needs nothing, so there is nothing to place before it."}
    // @returns false: a prerequisite of {course} sits on a cycle, so there is no valid order.
    for (const req of pre[course]) if (!dfs(req)) return false;
    // @why Leaving this path.
    // @say All prerequisites of {course} are placed. Take {course} off the in-progress chain.
    onPath.delete(course);
    // @why This course is completely done.
    // @say Mark course {course} as done, so another course that needs it skips it instead of placing it twice.
    visited.add(course);
    // @why All prerequisites are already in `output`, so this course can go next.
    // @say {pre[course].length ? "Every prerequisite of " + course + " is already in the order " + JSON.stringify(output) + ", so " + course + " can go next." : "Course " + course + " needs nothing, so it can go next."}
    // @then Order so far: {JSON.stringify(output)}.
    output.push(course); // @ask output.length // @moment take course {course}
    // @why No cycle below this course.
    // @returns true: course {course} is placed after everything it needs.
    return true;
  };

  // @why Run DFS from every course, since the graph may be disconnected.
  // @phase Place every course
  // @yes Place course {c}, if it is not placed yet. Every course gets its own start, since some may need nothing and be needed by nothing.
  // @no Every course is placed with no cycle found.
  // @say Place course {c} and everything it needs.
  // @returns []: course {c} leads into a cycle, so no order can take every course.
  for (let c = 0; c < numCourses; c++) if (!dfs(c)) return [];
  // @why A valid order, built in prerequisite-first order.
  // @phase Answer
  // @returns {JSON.stringify(output)}: each course was added only after all its prerequisites, so this order works. Each course and edge was handled once, O(V + E).
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
