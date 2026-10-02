/**
 * 1448. Count Good Nodes in Binary Tree
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/count-good-nodes-in-binary-tree/
 *
 * A node X in a binary tree is "good" if no node on the path from the root
 * to X has a value greater than X's value. Return the number of good nodes.
 *
 * Example 1:
 *   Input: root = [3, 1, 4, 3, null, 1, 5]
 *   Output: 4   (3, 4, 5 and the lower 3)
 *
 * Example 2:
 *   Input: root = [3, 3, null, 4, 2]
 *   Output: 3
 *
 * Example 3:
 *   Input: root = [1]
 *   Output: 1
 *
 * Constraints:
 *   1 <= number of nodes <= 10^5
 *   -10^4 <= Node.val <= 10^4
 *
 * Approach: DFS carrying the path maximum
 *   Pass down the largest value seen so far on the path. A node is good if
 *   its value is >= that max; then update the max for its children.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: Whether a node is good depends only on the maximum on its root-to-node
 *   path, so passing that single number down the recursion replaces storing the whole
 *   path.
 * Real world: Flagging new all-time highs along each branch of a hierarchy, like a
 *   manager chain where an employee is flagged if their score beats everyone above them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

export function goodNodes(root: TreeNode | null): number {
  const dfs = (node: TreeNode | null, maxSoFar: number): number => {
    if (!node) return 0;
    const good = node.val >= maxSoFar ? 1 : 0;
    const max = Math.max(maxSoFar, node.val);
    return good + dfs(node.left, max) + dfs(node.right, max);
  };
  return dfs(root, -Infinity);
}

// --- helper: LeetCode level-order array -> tree ---
function buildTree(values: (number | null)[]): TreeNode | null {
  if (values.length === 0 || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue: TreeNode[] = [root];
  let i = 1;
  for (let head = 0; head < queue.length && i < values.length; head++) {
    const node = queue[head];
    const l = values[i++];
    if (l != null) queue.push((node.left = new TreeNode(l)));
    const r = values[i++];
    if (r != null) queue.push((node.right = new TreeNode(r)));
  }
  return root;
}

test("1448. Count Good Nodes in Binary Tree", () => {
  assert.equal(goodNodes(buildTree([3, 1, 4, 3, null, 1, 5])), 4);
  assert.equal(goodNodes(buildTree([3, 3, null, 4, 2])), 3);
  assert.equal(goodNodes(buildTree([1])), 1);
  assert.equal(goodNodes(buildTree([5, 4, 3, 2, 1])), 1);
});
