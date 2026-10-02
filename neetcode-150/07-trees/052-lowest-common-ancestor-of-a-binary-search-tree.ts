/**
 * 235. Lowest Common Ancestor of a Binary Search Tree
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/
 *
 * Given a binary search tree and two of its nodes `p` and `q`, return their
 * lowest common ancestor: the deepest node that has both `p` and `q` as
 * descendants (a node counts as a descendant of itself).
 *
 * Example 1:
 *   Input: root = [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p = 2, q = 8
 *   Output: 6
 *
 * Example 2:
 *   Input: root = [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p = 2, q = 4
 *   Output: 2
 *
 * Example 3:
 *   Input: root = [2, 1], p = 2, q = 1
 *   Output: 2
 *
 * Constraints:
 *   2 <= number of nodes <= 10^5
 *   -10^9 <= Node.val <= 10^9
 *   All Node.val are unique; p != q; p and q exist in the BST.
 *
 * Approach: Walk down using the BST ordering
 *   If both values are smaller than the current node, the LCA is in the left
 *   subtree; if both are larger, it's in the right subtree. Otherwise the
 *   paths split here (or the current node is p or q), so this is the LCA.
 *
 * Time: O(h)   Space: O(1)
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

export function lowestCommonAncestor(root: TreeNode | null, p: TreeNode, q: TreeNode): TreeNode | null {
  let cur = root;
  while (cur) {
    if (p.val < cur.val && q.val < cur.val) cur = cur.left;
    else if (p.val > cur.val && q.val > cur.val) cur = cur.right;
    else return cur;
  }
  return null;
}

// --- helpers ---
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

function find(root: TreeNode | null, val: number): TreeNode {
  let cur = root;
  while (cur && cur.val !== val) cur = val < cur.val ? cur.left : cur.right;
  if (!cur) throw new Error(`value ${val} not in tree`);
  return cur;
}

function lca(values: (number | null)[], p: number, q: number): number | undefined {
  const root = buildTree(values);
  return lowestCommonAncestor(root, find(root, p), find(root, q))?.val;
}

test("235. Lowest Common Ancestor of a Binary Search Tree", () => {
  const tree = [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5];
  assert.equal(lca(tree, 2, 8), 6);
  assert.equal(lca(tree, 2, 4), 2);
  assert.equal(lca([2, 1], 2, 1), 2);
  assert.equal(lca(tree, 3, 5), 4);
  assert.equal(lca(tree, 0, 5), 2);
});
