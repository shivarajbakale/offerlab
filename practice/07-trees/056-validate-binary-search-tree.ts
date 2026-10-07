/**
 * 98. Validate Binary Search Tree
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/validate-binary-search-tree/
 *
 * Given the root of a binary tree, determine whether it is a valid binary
 * search tree: every node's left subtree holds only values strictly less
 * than the node, its right subtree only values strictly greater, and both
 * subtrees are themselves valid BSTs.
 *
 * Example 1:
 *   Input: root = [2, 1, 3]
 *   Output: true
 *
 * Example 2:
 *   Input: root = [5, 1, 4, null, null, 3, 6]
 *   Output: false   (4 is in the right subtree of 5 but is smaller)
 *
 * Constraints:
 *   1 <= number of nodes <= 10^4
 *   -2^31 <= Node.val <= 2^31 - 1
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

export function isValidBST(root: TreeNode | null): boolean {
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

test("98. Validate Binary Search Tree", () => {
  assert.equal(isValidBST(buildTree([2, 1, 3])), true);
  assert.equal(isValidBST(buildTree([5, 1, 4, null, null, 3, 6])), false);
  // Duplicates are not allowed
  assert.equal(isValidBST(buildTree([2, 2, 2])), false);
  // Violation deeper than the immediate parent
  assert.equal(isValidBST(buildTree([5, 4, 6, null, null, 3, 7])), false);
  assert.equal(isValidBST(buildTree([2147483647])), true);
});
