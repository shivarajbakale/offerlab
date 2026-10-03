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

// @why One tree node: a value plus links to its left and right child.
export class TreeNode {
  // @why The number stored in this node.
  val: number;
  // @why The left child, or `null` if there is none.
  left: TreeNode | null;
  // @why The right child, or `null` if there is none.
  right: TreeNode | null;
  // @why Lets us build a node in one line; children default to empty.
  constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    // @why Save the value on the node.
    this.val = val;
    // @why Save the left child link.
    this.left = left;
    // @why Save the right child link.
    this.right = right;
  }
}

// @why Depth of a tree = 1 for this node + the deeper of its two subtrees.
export function maxDepth(root: TreeNode | null): number {
  // @why Base case: no node means depth 0, which also ends the recursion.
  if (!root) return 0;
  // @why Ask each side for its depth, keep the bigger one, and add 1 for this node.
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
