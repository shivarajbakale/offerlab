/**
 * 226. Invert Binary Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/invert-binary-tree/
 *
 * Given the root of a binary tree, mirror it (swap every node's left and
 * right children) and return its root.
 *
 * Example 1:
 *   Input: root = [4, 2, 7, 1, 3, 6, 9]
 *   Output: [4, 7, 2, 9, 6, 3, 1]
 *
 * Example 2:
 *   Input: root = [2, 1, 3]
 *   Output: [2, 3, 1]
 *
 * Example 3:
 *   Input: root = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 100
 *   -100 <= Node.val <= 100
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

export function invertTree(root: TreeNode | null): TreeNode | null {
  // TODO: implement
  throw new Error("Not implemented");
}

// --- helpers: LeetCode level-order array <-> tree ---
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

test("226. Invert Binary Tree", () => {
  assert.deepEqual(toArray(invertTree(buildTree([4, 2, 7, 1, 3, 6, 9]))), [4, 7, 2, 9, 6, 3, 1]);
  assert.deepEqual(toArray(invertTree(buildTree([2, 1, 3]))), [2, 3, 1]);
  assert.deepEqual(toArray(invertTree(buildTree([]))), []);
  assert.deepEqual(toArray(invertTree(buildTree([1, 2]))), [1, null, 2]);
});
