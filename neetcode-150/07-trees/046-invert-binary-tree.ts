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
// @goal how do you mirror the subtree under {root ? root.val : "this empty spot"}, so every left becomes a right?
export function invertTree(root: TreeNode | null): TreeNode | null {
  // @why Base case: an empty tree has nothing to swap, so stop here.
  // @phase Stop at empty spots
  // @yes Empty spot: there are no children to swap, so the mirror of nothing is nothing.
  // @no Node {root.val} exists. A mirror image is just "every node's two children swapped", so swap here and let the children handle themselves.
  // @returns null: the mirror of an empty subtree is still empty.
  if (!root) return null;
  // @why Swap the two children; this one swap is what mirrors this node.
  // @phase Swap at this node, then mirror below it
  // @say Building a new mirrored copy would cost O(n) extra nodes. Instead swap {root.val}'s two child links in place{root.left || root.right ? ": left gets " + (root.right ? root.right.val : "nothing") + ", right gets " + (root.left ? root.left.val : "nothing") : ". It is a leaf, so both links are empty and the swap changes nothing"}.
  // @then {root.left || root.right ? root.val + " now has " + (root.left ? root.left.val : "nothing") + " on the left and " + (root.right ? root.right.val : "nothing") + " on the right. The subtrees below are not mirrored yet." : "Leaf " + root.val + " is already its own mirror."}
  [root.left, root.right] = [root.right, root.left]; // @ask root.left?root.left.val:null // @moment mirror {root.val}
  // @why Mirror everything under the (new) left child the same way.
  // @say Swapping at {root.val} only flipped the top level. Each subtree must be mirrored inside too, so recurse into the new left side{root.left ? ", " + root.left.val : ""}.
  // @then The left subtree of {root.val} is now fully mirrored.
  invertTree(root.left);
  // @why Do the same for the right side; the order of the two calls does not matter.
  // @say Now the new right side{root.right ? ", " + root.right.val : ""}. The two sides share no nodes, so order does not matter.
  // @then Both subtrees of {root.val} are mirrored, so the whole subtree under {root.val} is a mirror image.
  invertTree(root.right);
  // @why Hand back the root so callers get the whole mirrored tree.
  // @phase Hand the mirrored subtree back
  // @returns node {root.val}, the same node as before, with everything below it mirrored. Each node is swapped exactly once: O(n).
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
