/**
 * 105. Construct Binary Tree from Preorder and Inorder Traversal
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/
 *
 * Given two integer arrays `preorder` and `inorder` that are the preorder and
 * inorder traversals of the same binary tree (with unique values), rebuild
 * and return that tree.
 *
 * Example 1:
 *   Input: preorder = [3, 9, 20, 15, 7], inorder = [9, 3, 15, 20, 7]
 *   Output: [3, 9, 20, null, null, 15, 7]
 *
 * Example 2:
 *   Input: preorder = [-1], inorder = [-1]
 *   Output: [-1]
 *
 * Constraints:
 *   1 <= preorder.length <= 3000
 *   inorder.length == preorder.length
 *   -3000 <= preorder[i], inorder[i] <= 3000
 *   Values are unique; inorder is guaranteed to match preorder.
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

export function buildTree(preorder: number[], inorder: number[]): TreeNode | null {
  // TODO: implement
  throw new Error("Not implemented");
}

// --- helper: tree -> LeetCode level-order array ---
function toArray(root: TreeNode | null): (number | null)[] {
  const out: (number | null)[] = [];
  const queue: (TreeNode | null)[] = [root];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node) {
      out.push(node.val);
      queue.push(node.left, node.right);
    } else out.push(null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

test("105. Construct Binary Tree from Preorder and Inorder Traversal", () => {
  assert.deepEqual(toArray(buildTree([3, 9, 20, 15, 7], [9, 3, 15, 20, 7])), [3, 9, 20, null, null, 15, 7]);
  assert.deepEqual(toArray(buildTree([-1], [-1])), [-1]);
  // Left-skewed tree
  assert.deepEqual(toArray(buildTree([1, 2, 3], [3, 2, 1])), [1, 2, null, 3]);
  // Right-skewed tree
  assert.deepEqual(toArray(buildTree([1, 2, 3], [1, 2, 3])), [1, null, 2, null, 3]);
});
