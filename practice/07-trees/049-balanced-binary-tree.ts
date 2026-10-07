/**
 * 110. Balanced Binary Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/balanced-binary-tree/
 *
 * Given a binary tree, determine whether it is height-balanced: for every
 * node, the heights of its left and right subtrees differ by at most one.
 *
 * Example 1:
 *   Input: root = [3, 9, 20, null, null, 15, 7]
 *   Output: true
 *
 * Example 2:
 *   Input: root = [1, 2, 2, 3, 3, null, null, 4, 4]
 *   Output: false
 *
 * Example 3:
 *   Input: root = []
 *   Output: true
 *
 * Constraints:
 *   0 <= number of nodes <= 5000
 *   -10^4 <= Node.val <= 10^4
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

export function isBalanced(root: TreeNode | null): boolean {
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

test("110. Balanced Binary Tree", () => {
  assert.equal(isBalanced(buildTree([3, 9, 20, null, null, 15, 7])), true);
  assert.equal(isBalanced(buildTree([1, 2, 2, 3, 3, null, null, 4, 4])), false);
  assert.equal(isBalanced(buildTree([])), true);
  // Root looks balanced but subtrees are not
  assert.equal(isBalanced(buildTree([1, 2, 2, 3, null, null, 3, 4, null, null, 4])), false);
});
