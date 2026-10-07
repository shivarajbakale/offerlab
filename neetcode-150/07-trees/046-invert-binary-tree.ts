/**
 * 226. Invert Binary Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/invert-binary-tree/
 *
 * Given the root of a binary tree, mirror it (swap every node's left and
 * right children) and return its root.
 *
 * Example 1:
 *   Input: root = [4, 2, 7, 1, 3, 6, 9]
 *   Output: [4, 7, 2, 9, 6, 3, 1]
 *
 * Example 2:
 *   Input: root = [2, 1, 3]
 *   Output: [2, 3, 1]
 *
 * Example 3:
 *   Input: root = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 100
 *   -100 <= Node.val <= 100
 *
 * Approach: Recursive DFS
 *   Swap the children of the current node, then invert each subtree.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: Mirroring a tree is just swapping left and right at every node; the order
 *   of visits does not matter because each swap is local and independent of the others.
 * Real world: Rendering a right-to-left layout by mirroring the UI layout tree, or
 *   flipping a scene graph horizontally in a drawing tool.
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

// @rule each finished call has mirrored its whole subtree before returning it
// @why Returns the same root, now mirrored; `null` in means `null` out.
export function invertTree(root: TreeNode | null): TreeNode | null {
  // @why Base case: an empty tree has nothing to swap, so stop here.
  if (!root) return null; // @say Empty subtree: nothing to invert
  // @why Swap the two children; this one swap is what mirrors this node.
  [root.left, root.right] = [root.right, root.left]; // @ask root.left?root.left.val:null // @moment mirror {root.val} // @say Mirror node {root.val}: swap its left and right children
  // @why Mirror everything under the (new) left child the same way.
  invertTree(root.left); // @say Now invert the (new) left subtree of {root.val}
  // @why Do the same for the right side; the order of the two calls does not matter.
  invertTree(root.right); // @say Then invert the (new) right subtree of {root.val}
  // @why Hand back the root so callers get the whole mirrored tree.
  return root;
}

// --- helpers: LeetCode level-order array <-> tree ---
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

function toArray(root: TreeNode | null): (number | null)[] {
  const out: (number | null)[] = [];
  const queue: (TreeNode | null)[] = [root];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node) {
      out.push(node.val);
      queue.push(node.left, node.right);
    } else out.push(null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

test("226. Invert Binary Tree", () => {
  assert.deepEqual(toArray(invertTree(buildTree([4, 2, 7, 1, 3, 6, 9]))), [4, 7, 2, 9, 6, 3, 1]);
  assert.deepEqual(toArray(invertTree(buildTree([2, 1, 3]))), [2, 3, 1]);
  assert.deepEqual(toArray(invertTree(buildTree([]))), []);
  assert.deepEqual(toArray(invertTree(buildTree([1, 2]))), [1, null, 2]);
});
