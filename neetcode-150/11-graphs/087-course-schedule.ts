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
// @goal can all {numCourses} courses be finished, given prerequisites {JSON.stringify(prerequisites)}?
export function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  // @why `pre[c]` lists the courses that must be done before course `c`.
  // @phase Setup: who needs whom
  // @say Simulating every possible order of courses is n! work. But the only way to get stuck is a loop of courses that each need the next, so all you need to know is whether the prerequisite graph has a cycle.
  const pre: number[][] = Array.from({ length: numCourses }, () => []);
  // @why Fill in the prerequisite list from the input pairs.
  // @say Record each pair as "course → what it needs", so a walk from a course follows its prerequisites.
  // @then Prerequisites per course: {JSON.stringify(pre)}.
  for (const [course, req] of prerequisites) pre[course].push(req);

  // @why Courses on the current DFS path; meeting one again means a cycle.
  // @say Track the chain of courses being checked right now. If a course's prerequisites lead back into this chain, that chain is a cycle.
  const visiting = new Set<number>();

  // @why Returns true if this course can be completed.
  // @phase Follow prerequisites, watching for a loop
  // @goal can course {course} be completed{visiting.size ? ", while checking " + [...visiting].join(" → ") : ""}?
  const dfs = (course: number): boolean => {
    // @why Cycle found: the course needs itself, so it can never be taken.
    // @yes Course {course} is already on the chain being checked ({[...visiting].join(" → ")}). Following prerequisites came back to it, so it needs itself: a cycle.
    // @no Course {course} is not on the current chain, so no loop through it yet.
    // @returns false: a cycle can never be started, so these courses can't be finished.
    if (visiting.has(course)) return false; // @broken
    // @why No prerequisites left, so the course is takeable.
    // @yes Course {course} needs nothing (or was already proven doable), so it can always be taken.
    // @no Course {course} needs {JSON.stringify(pre[course])} first, so check those.
    // @returns true: nothing stands in the way of course {course}.
    if (pre[course].length === 0) return true;
    // @why Mark this course as on the current path.
    // @say Put course {course} on the chain being checked. If any prerequisite below leads back to it, the check above will catch it.
    visiting.add(course); // @ask visiting.size
    // @why Every prerequisite must itself be completable.
    // @say Course {course} is doable only if every prerequisite ({JSON.stringify(pre[course])}) is. One that fails dooms course {course} too.
    // @returns false: a prerequisite of {course} sits on a cycle, so {course} can't be taken either.
    for (const req of pre[course]) if (!dfs(req)) return false;
    // @why Done with this path, so remove it; another path may legally reach it later.
    // @say Every prerequisite of {course} checks out. Take {course} off the chain: reaching it again from a different course is fine, not a cycle.
    visiting.delete(course);
    // @why Remember it is fine, so later visits return instantly.
    // @say Remember that {course} is doable by clearing its list. A later visit then returns at once, so each course is explored only once.
    pre[course] = []; // @moment course {course} can be taken
    // @why Every prerequisite checked out.
    // @returns true: course {course} and everything it needs can be taken.
    return true;
  };

  // @why Run DFS from every course, since the graph may be disconnected.
  // @phase Check every course
  // @yes Check course {c}. The graph may be in separate pieces, so every course gets its own start.
  // @no Every course checked out, with no cycle anywhere.
  // @say Can course {c} be completed?
  // @returns false: course {c} leads into a cycle, so not every course can be finished.
  for (let c = 0; c < numCourses; c++) if (!dfs(c)) return false;
  // @why No cycle anywhere, so all courses can be finished.
  // @phase Answer
  // @returns true: no prerequisite chain loops, so all {numCourses} courses can be taken. Each course and edge was explored once, O(V + E).
  return true;
}

test("207. Course Schedule", () => {
  assert.equal(canFinish(2, [[1, 0]]), true);
  assert.equal(canFinish(2, [[1, 0], [0, 1]]), false);
  assert.equal(canFinish(1, []), true);
  assert.equal(canFinish(5, [[1, 4], [2, 4], [3, 1], [3, 2]]), true);
  assert.equal(canFinish(3, [[0, 1], [1, 2], [2, 0]]), false);
});
