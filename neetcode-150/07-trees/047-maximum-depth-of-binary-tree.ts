/**
 * 104. Maximum Depth of Binary Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/maximum-depth-of-binary-tree/
 *
 * Given the root of a binary tree, return its maximum depth: the number of
 * nodes on the longest path from the root down to a leaf.
 *
 * Example 1:
 *   Input: root = [3, 9, 20, null, null, 15, 7]
 *   Output: 3
 *
 * Example 2:
 *   Input: root = [1, null, 2]
 *   Output: 2
 *
 * Constraints:
 *   0 <= number of nodes <= 10^4
 *   -100 <= Node.val <= 100
 *
 * Approach: Recursive DFS
 *   Depth of a node = 1 + max(depth of left, depth of right); empty tree is 0.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: A tree's depth is defined in terms of its subtrees' depths, so the answer
 *   for a node is 1 plus the larger child answer, with an empty tree as 0. Each node is
 *   visited once.
 * Real world: Measuring the nesting depth of a DOM tree or a JSON document to enforce a
 *   maximum depth limit in a parser.
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

export function maxDepth(root: TreeNode | null): number {
  if (!root) return 0;
  return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
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

test("104. Maximum Depth of Binary Tree", () => {
  assert.equal(maxDepth(buildTree([3, 9, 20, null, null, 15, 7])), 3);
  assert.equal(maxDepth(buildTree([1, null, 2])), 2);
  assert.equal(maxDepth(buildTree([])), 0);
  assert.equal(maxDepth(buildTree([1, 2, null, 3, null, 4])), 4);
});
