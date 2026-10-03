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
 *
 * Pattern: bst
 * Key insight: In a BST, comparing p and q against the current value tells which side
 *   each one lives on. The first node where they are not both on the same side is where
 *   their paths split, which is the LCA, so no full traversal is needed.
 * Real world: Finding the smallest range bucket that contains two keys in a sorted range
 *   index, such as the common parent block of two keys in a B-tree.
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

// @why Find the lowest node that has both `p` and `q` under it, using BST ordering.
export function lowestCommonAncestor(root: TreeNode | null, p: TreeNode, q: TreeNode): TreeNode | null {
  // @why Walk down from the root with a pointer, no recursion needed.
  let cur = root;
  // @why Keep going while there is a node to look at.
  while (cur) {
    // @why Both targets are smaller, so the answer must be in the left subtree.
    if (p.val < cur.val && q.val < cur.val) cur = cur.left;
    // @why Both targets are bigger, so the answer must be in the right subtree.
    else if (p.val > cur.val && q.val > cur.val) cur = cur.right;
    // @why They split here (or one equals this node), so this is the lowest common ancestor.
    else return cur;
  }
  // @why Only reached for an empty tree; there is no ancestor.
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
