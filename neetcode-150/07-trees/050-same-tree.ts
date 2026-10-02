/**
 * 100. Same Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/same-tree/
 *
 * Given the roots of two binary trees `p` and `q`, return true if they are
 * structurally identical and every corresponding node has the same value.
 *
 * Example 1:
 *   Input: p = [1, 2, 3], q = [1, 2, 3]
 *   Output: true
 *
 * Example 2:
 *   Input: p = [1, 2], q = [1, null, 2]
 *   Output: false
 *
 * Example 3:
 *   Input: p = [1, 2, 1], q = [1, 1, 2]
 *   Output: false
 *
 * Constraints:
 *   0 <= number of nodes in each tree <= 100
 *   -10^4 <= Node.val <= 10^4
 *
 * Approach: Recursive DFS
 *   Two empty trees match; if exactly one is empty or the values differ they
 *   don't; otherwise compare left with left and right with right.
 *
 * Time: O(n)   Space: O(h) recursion stack
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

export function isSameTree(p: TreeNode | null, q: TreeNode | null): boolean {
  if (!p && !q) return true;
  if (!p || !q || p.val !== q.val) return false;
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
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

test("100. Same Tree", () => {
  assert.equal(isSameTree(buildTree([1, 2, 3]), buildTree([1, 2, 3])), true);
  assert.equal(isSameTree(buildTree([1, 2]), buildTree([1, null, 2])), false);
  assert.equal(isSameTree(buildTree([1, 2, 1]), buildTree([1, 1, 2])), false);
  assert.equal(isSameTree(buildTree([]), buildTree([])), true);
  assert.equal(isSameTree(buildTree([1]), buildTree([])), false);
});
