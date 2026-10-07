/**
 * 572. Subtree of Another Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/subtree-of-another-tree/
 *
 * Given the roots of two binary trees `root` and `subRoot`, return true if
 * some node of `root` is the root of a subtree with exactly the same
 * structure and values as `subRoot`. A subtree consists of a node and all of
 * its descendants (the tree itself counts as a subtree of itself).
 *
 * Example 1:
 *   Input: root = [3, 4, 5, 1, 2], subRoot = [4, 1, 2]
 *   Output: true
 *
 * Example 2:
 *   Input: root = [3, 4, 5, 1, 2, null, null, null, null, 0], subRoot = [4, 1, 2]
 *   Output: false
 *
 * Constraints:
 *   1 <= number of nodes in root <= 2000
 *   1 <= number of nodes in subRoot <= 1000
 *   -10^4 <= Node.val <= 10^4
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

export function isSubtree(root: TreeNode | null, subRoot: TreeNode | null): boolean {
  // TODO: implement
  throw new Error("Not implemented");
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

test("572. Subtree of Another Tree", () => {
  assert.equal(isSubtree(buildTree([3, 4, 5, 1, 2]), buildTree([4, 1, 2])), true);
  assert.equal(isSubtree(buildTree([3, 4, 5, 1, 2, null, null, null, null, 0]), buildTree([4, 1, 2])), false);
  assert.equal(isSubtree(buildTree([1, 1]), buildTree([1])), true);
  assert.equal(isSubtree(buildTree([1]), buildTree([2])), false);
});
