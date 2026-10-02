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

export function kthSmallest(root: TreeNode | null, k: number): number {
  const stack: TreeNode[] = [];
  let cur = root;

  while (cur || stack.length) {
    // Go as far left as possible.
    while (cur) {
      stack.push(cur);
      cur = cur.left;
    }
    const node = stack.pop()!;
    if (--k === 0) return node.val;
    cur = node.right;
  }
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
