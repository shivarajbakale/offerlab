/**
 * 230. Kth Smallest Element in a BST
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/kth-smallest-element-in-a-bst/
 *
 * Given the root of a binary search tree and an integer `k`, return the k-th
 * smallest value (1-indexed) among all node values in the tree.
 *
 * Example 1:
 *   Input: root = [3, 1, 4, null, 2], k = 1
 *   Output: 1
 *
 * Example 2:
 *   Input: root = [5, 3, 6, 2, 4, null, null, 1], k = 3
 *   Output: 3
 *
 * Constraints:
 *   1 <= k <= n <= 10^4
 *   0 <= Node.val <= 10^4
 *
 * Approach: Iterative in-order traversal
 *   In-order traversal of a BST visits values in ascending order. Use an
 *   explicit stack and stop at the k-th node popped.
 *
 * Time: O(h + k)   Space: O(h)
 *
 * Pattern: bst
 * Key insight: In-order traversal of a BST yields values in sorted order, so the k-th
 *   popped node is the answer. The explicit stack allows stopping right there instead of
 *   visiting the whole tree.
 * Real world: Paginating sorted results from an ordered index: a database cursor walks a
 *   B-tree in key order and stops after the k-th row.
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

// @rule the stack holds ancestors still waiting to be visited, smallest on top
// @why Inorder walk of a BST gives values in sorted order, so the kth one visited is the answer.
export function kthSmallest(root: TreeNode | null, k: number): number {
  // @why Our own stack replaces recursion, remembering nodes we still need to come back to.
  const stack: TreeNode[] = [];
  // @why `cur` is the node we are about to explore.
  let cur = root;

  // @why Continue while there is a node to go into or a saved node to return to.
  while (cur || stack.length) {
    // Go as far left as possible.
    // @why The smallest values are down the left side, so dive left first.
    while (cur) {
      // @why Save this node; we will come back to it after its left side is done.
      stack.push(cur);
      // @why Step to the left child.
      cur = cur.left;
    }
    // @why Nothing more on the left, so the top of the stack is the next smallest value.
    const node = stack.pop()!; // @ask node.val // @moment visit {stack[stack.length - 1].val}
    // @why Count down `k`; when it hits 0 this node is the kth smallest.
    if (--k === 0) return node.val;
    // @why Now explore the right subtree, which holds the next larger values.
    cur = node.right;
  }
  // @why Only reached when `k` is bigger than the tree size, which is invalid input.
  throw new Error("k is larger than the number of nodes");
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

test("230. Kth Smallest Element in a BST", () => {
  assert.equal(kthSmallest(buildTree([3, 1, 4, null, 2]), 1), 1);
  assert.equal(kthSmallest(buildTree([5, 3, 6, 2, 4, null, null, 1]), 3), 3);
  assert.equal(kthSmallest(buildTree([1]), 1), 1);
  assert.equal(kthSmallest(buildTree([5, 3, 6, 2, 4, null, null, 1]), 6), 6);
});
