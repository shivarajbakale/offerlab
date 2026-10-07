/**
 * 323. Number of Connected Components in an Undirected Graph (Premium; LintCode 3651)
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/
 *
 * There is an undirected graph with `n` nodes labeled 0..n-1, and an array
 * `edges` where edges[i] = [a, b] is an edge between a and b. Return the
 * number of connected components in the graph.
 *
 * Example 1:
 *   Input: n = 5, edges = [[0,1],[1,2],[3,4]]
 *   Output: 2
 *
 * Example 2:
 *   Input: n = 5, edges = [[0,1],[1,2],[2,3],[3,4]]
 *   Output: 1
 *
 * Constraints:
 *   1 <= n <= 2000
 *   1 <= edges.length <= 5000
 *   0 <= a, b < n, a != b, no repeated edges
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function countComponents(n: number, edges: number[][]): number {
  // TODO: implement
  throw new Error("Not implemented");
}

test("323. Number of Connected Components in an Undirected Graph", () => {
  assert.equal(countComponents(5, [[0, 1], [1, 2], [3, 4]]), 2);
  assert.equal(countComponents(5, [[0, 1], [1, 2], [2, 3], [3, 4]]), 1);
  assert.equal(countComponents(3, []), 3);
  assert.equal(countComponents(4, [[0, 1], [1, 2], [2, 0]]), 2);
});
