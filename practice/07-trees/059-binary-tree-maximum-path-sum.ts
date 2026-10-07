/**
 * 124. Binary Tree Maximum Path Sum
 * Difficulty: Hard
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/binary-tree-maximum-path-sum/
 *
 * A path in a binary tree is a sequence of nodes where each adjacent pair is
 * connected by an edge, and no node appears more than once. The path need
 * not pass through the root and contains at least one node. Its sum is the
 * total of its node values. Given the root, return the maximum path sum.
 *
 * Example 1:
 *   Input: root = [1, 2, 3]
 *   Output: 6   (2 -> 1 -> 3)
 *
 * Example 2:
 *   Input: root = [-10, 9, 20, null, null, 15, 7]
 *   Output: 42  (15 -> 20 -> 7)
 *
 * Constraints:
 *   1 <= number of nodes <= 3 * 10^4
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

export function maxPathSum(root: TreeNode | null): number {
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

test("124. Binary Tree Maximum Path Sum", () => {
  assert.equal(maxPathSum(buildTree([1, 2, 3])), 6);
  assert.equal(maxPathSum(buildTree([-10, 9, 20, null, null, 15, 7])), 42);
  // All negative: best path is the single largest node
  assert.equal(maxPathSum(buildTree([-3, -2, -1])), -1);
  assert.equal(maxPathSum(buildTree([2, -1])), 2);
});
