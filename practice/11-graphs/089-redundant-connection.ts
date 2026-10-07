/**
 * 684. Redundant Connection
 * Difficulty: Medium
 * Category: Graphs
 * LeetCode: https://leetcode.com/problems/redundant-connection/
 *
 * A tree with n nodes labeled 1..n had one extra edge added, connecting two
 * different existing nodes. Given the resulting `edges` array (length n),
 * return an edge that can be removed so the graph becomes a tree again. If
 * there are multiple answers, return the one that appears last in `edges`.
 *
 * Example 1:
 *   Input: edges = [[1,2],[1,3],[2,3]]
 *   Output: [2,3]
 *
 * Example 2:
 *   Input: edges = [[1,2],[2,3],[3,4],[1,4],[1,5]]
 *   Output: [1,4]
 *
 * Constraints:
 *   3 <= n <= 1000
 *   edges[i].length == 2, 1 <= a < b <= n
 *   No repeated edges; the graph is connected
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function findRedundantConnection(edges: number[][]): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

test("684. Redundant Connection", () => {
  assert.deepEqual(findRedundantConnection([[1, 2], [1, 3], [2, 3]]), [2, 3]);
  assert.deepEqual(findRedundantConnection([[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]), [1, 4]);
  assert.deepEqual(findRedundantConnection([[3, 4], [1, 2], [2, 4], [3, 5], [2, 5]]), [2, 5]);
});
