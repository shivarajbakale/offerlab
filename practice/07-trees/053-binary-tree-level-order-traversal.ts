/**
 * 102. Binary Tree Level Order Traversal
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/binary-tree-level-order-traversal/
 *
 * Given the root of a binary tree, return the values of its nodes level by
 * level, from top to bottom, and left to right within each level.
 *
 * Example 1:
 *   Input: root = [3, 9, 20, null, null, 15, 7]
 *   Output: [[3], [9, 20], [15, 7]]
 *
 * Example 2:
 *   Input: root = [1]
 *   Output: [[1]]
 *
 * Example 3:
 *   Input: root = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 2000
 *   -1000 <= Node.val <= 1000
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

export function levelOrder(root: TreeNode | null): number[][] {
  // TODO: implement
  throw new Error("Not implemented");
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

test("102. Binary Tree Level Order Traversal", () => {
  assert.deepEqual(levelOrder(buildTree([3, 9, 20, null, null, 15, 7])), [[3], [9, 20], [15, 7]]);
  assert.deepEqual(levelOrder(buildTree([1])), [[1]]);
  assert.deepEqual(levelOrder(buildTree([])), []);
  assert.deepEqual(levelOrder(buildTree([1, 2, null, 3, null, 4])), [[1], [2], [3], [4]]);
});
