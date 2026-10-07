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
 *
 * Approach: Bottom-up DFS
 *   Return each subtree's height, or -1 as a sentinel once any subtree is
 *   unbalanced, so the whole check finishes in a single pass.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: Checking balance top-down recomputes heights again and again (O(n^2)).
 *   Returning the height bottom-up and using -1 as an 'already unbalanced' signal lets
 *   one pass both measure and validate, and stop early.
 * Real world: Self-balancing trees such as AVL trees compare child heights after every
 *   insert to decide whether a rotation is needed.
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

// @rule height returns the subtree's height, or -1 once any node below it is unbalanced
// @why Answers whether every node has left and right heights differing by at most 1.
export function isBalanced(root: TreeNode | null): boolean {
  // Height of the subtree, or -1 if it is unbalanced.
  // @why Returns the height, but uses -1 as a signal that something below is unbalanced.
  const height = (node: TreeNode | null): number => {
    // @why An empty subtree is balanced and has height 0.
    if (!node) return 0;
    // @why Get the left height first.
    const l = height(node.left);
    // @why If the left side is already unbalanced, pass the bad news up without more work.
    if (l === -1) return -1;
    // @why Get the right height.
    const r = height(node.right);
    // @why Unbalanced if the right side is bad, or the two heights differ by more than 1.
    if (r === -1 || Math.abs(l - r) > 1) return -1;
    // @why Balanced here, so the real height is one more than the taller side.
    const h = 1 + Math.max(l, r); // @ask h
    // @why Report it for the parent to check.
    return h;
  };
  // @why Any -1 anywhere means unbalanced; otherwise the whole tree is balanced.
  return height(root) !== -1;
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
