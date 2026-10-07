/**
 * 261. Graph Valid Tree (Premium; LintCode 178)
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/graph-valid-tree/
 *
 * Given `n` nodes labeled 0..n-1 and a list of undirected `edges` (each a
 * pair of nodes), determine whether these edges form a valid tree: the
 * graph must be fully connected and contain no cycles.
 *
 * Example 1:
 *   Input: n = 5, edges = [[0,1],[0,2],[0,3],[1,4]]
 *   Output: true
 *
 * Example 2:
 *   Input: n = 5, edges = [[0,1],[1,2],[2,3],[1,3],[1,4]]
 *   Output: false
 *
 * Constraints:
 *   1 <= n <= 100
 *   0 <= edges.length <= n * (n - 1) / 2
 *   No duplicate edges and no self-loops
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function validTree(n: number, edges: number[][]): boolean {
  // TODO: implement
  throw new Error("Not implemented");
}

test("261. Graph Valid Tree", () => {
  assert.equal(validTree(5, [[0, 1], [0, 2], [0, 3], [1, 4]]), true);
  assert.equal(validTree(5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]), false);
  assert.equal(validTree(1, []), true);
  // n - 1 edges but disconnected (has a cycle elsewhere).
  assert.equal(validTree(4, [[0, 1], [1, 2], [2, 0]]), false);
});
