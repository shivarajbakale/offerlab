/**
 * 543. Diameter of Binary Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/diameter-of-binary-tree/
 *
 * Given the root of a binary tree, return the length of its diameter: the
 * number of edges on the longest path between any two nodes. The path may or
 * may not pass through the root.
 *
 * Example 1:
 *   Input: root = [1, 2, 3, 4, 5]
 *   Output: 3   (path 4 -> 2 -> 1 -> 3 or 5 -> 2 -> 1 -> 3)
 *
 * Example 2:
 *   Input: root = [1, 2]
 *   Output: 1
 *
 * Constraints:
 *   1 <= number of nodes <= 10^4
 *   -100 <= Node.val <= 100
 *
 * Approach: DFS returning height
 *   For each node, the longest path through it is height(left) + height(right).
 *   Track the max of that while returning 1 + max(height(left), height(right)).
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: The longest path must bend at some highest node, where its length is
 *   height(left) + height(right). One post-order pass that returns heights can compute
 *   that at every node and keep the best, instead of recomputing heights per node.
 * Real world: Finding the two most distant routers in a tree-shaped network (the
 *   worst-case hop count) to size timeouts.
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

export function diameterOfBinaryTree(root: TreeNode | null): number {
  let best = 0;

  const height = (node: TreeNode | null): number => {
    if (!node) return 0;
    const l = height(node.left);
    const r = height(node.right);
    best = Math.max(best, l + r);
    return 1 + Math.max(l, r);
  };

  height(root);
  return best;
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

test("543. Diameter of Binary Tree", () => {
  assert.equal(diameterOfBinaryTree(buildTree([1, 2, 3, 4, 5])), 3);
  assert.equal(diameterOfBinaryTree(buildTree([1, 2])), 1);
  assert.equal(diameterOfBinaryTree(buildTree([1])), 0);
  // Longest path does not pass through the root
  assert.equal(diameterOfBinaryTree(buildTree([1, 2, null, 3, 4, 5, null, null, 6, 7, null, null, 8])), 6);
});
