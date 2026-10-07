/**
 * 105. Construct Binary Tree from Preorder and Inorder Traversal
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/
 *
 * Given two integer arrays `preorder` and `inorder` that are the preorder and
 * inorder traversals of the same binary tree (with unique values), rebuild
 * and return that tree.
 *
 * Example 1:
 *   Input: preorder = [3, 9, 20, 15, 7], inorder = [9, 3, 15, 20, 7]
 *   Output: [3, 9, 20, null, null, 15, 7]
 *
 * Example 2:
 *   Input: preorder = [-1], inorder = [-1]
 *   Output: [-1]
 *
 * Constraints:
 *   1 <= preorder.length <= 3000
 *   inorder.length == preorder.length
 *   -3000 <= preorder[i], inorder[i] <= 3000
 *   Values are unique; inorder is guaranteed to match preorder.
 *
 * Approach: Recursion with an inorder index map
 *   The next value in preorder is always the root of the current subtree.
 *   Its position in inorder splits the remaining values into the left and
 *   right subtrees. A hash map gives that position in O(1), and a shared
 *   preorder pointer advances as we build left before right.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: tree-dfs,hashing
 * Key insight: Preorder always reveals the current subtree's root next, and that root's
 *   position in inorder splits the remaining values into left and right subtrees. A value
 *   -> index map makes each split O(1), so the whole build is O(n).
 * Real world: Rebuilding a tree from two flat traversal dumps, such as restoring a
 *   document outline or call tree from serialized logs.
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

// @viz array:inorder window:lo..hi
// @rule build(lo, hi) makes the subtree of inorder[lo..hi]; preorder[pre] is its root
// @why Rebuild a tree from preorder (root first) and inorder (left, root, right) lists.
// @goal which tree has preorder {JSON.stringify(preorder)} and inorder {JSON.stringify(inorder)}?
export function buildTree(preorder: number[], inorder: number[]): TreeNode | null {
  // @why Map each value to its inorder position so finding the root's split point is instant.
  // @phase Setup
  // @say Each subtree needs its root's position in inorder. Scanning for it each time is O(n²) overall; a value → index map makes each lookup O(1).
  const indexOf = new Map<number, number>();
  // @why Fill the map with every value and its index.
  inorder.forEach((v, i) => indexOf.set(v, i));
  // @why `pre` points to the next root in the preorder list.
  // @say Preorder lists every root before its subtrees, so reading it left to right hands out roots in exactly the order you build them.
  let pre = 0;

  // Build the subtree whose values occupy inorder[lo..hi].
  // @why Builds the subtree whose values sit in the inorder range `lo` to `hi`.
  // @goal which subtree is made of inorder[{lo}..{hi}] = {JSON.stringify(inorder.slice(lo, hi + 1))}?
  const build = (lo: number, hi: number): TreeNode | null => {
    // @why An empty range means no node here.
    // @phase Take the next root, split inorder around it
    // @yes The range {lo}..{hi} is empty: no values belong here.
    // @no {hi - lo + 1} {hi === lo ? "value belongs" : "values belong"} in this subtree.
    // @returns null: no values, so no node.
    if (lo > hi) return null;
    // @why Preorder lists the root first, so the next unused value is this subtree's root.
    // @say Next unused in preorder is {preorder[pre]}. Preorder always lists a root before its subtrees, so {preorder[pre]} is this subtree's root.
    const val = preorder[pre++];
    // @why Find the root in inorder; everything left of it is the left subtree, the rest is right.
    // @say {val} sits at inorder index {indexOf.get(val)}. Inorder puts left subtree, root, right subtree in that order, so this one position splits the range in two.
    const mid = indexOf.get(val)!; // @ask mid
    // @why Create the node for this root value.
    const node = new TreeNode(val); // @moment root {val}
    // @why Build the left side first, because preorder lists the left subtree before the right.
    // @say Left of {val} in inorder: {JSON.stringify(inorder.slice(lo, mid))}. Build it first, because preorder lists all of the left subtree before any of the right.
    // @then {val}'s left child: {node.left ? node.left.val : "none"}.
    node.left = build(lo, mid - 1);
    // @why Build the right side from what is right of the root's position.
    // @say Right of {val} in inorder: {JSON.stringify(inorder.slice(mid + 1, hi + 1))}. Preorder has now used up the left subtree, so its next value is the right subtree's root.
    // @then {val}'s right child: {node.right ? node.right.val : "none"}.
    node.right = build(mid + 1, hi);
    // @why Return the finished subtree to the caller.
    // @returns node {val}, with its whole subtree built.
    return node;
  };

  // @why Start with the full inorder range.
  // @phase Build the whole range
  // @returns the root, {preorder[0]}. Each value was placed once with an O(1) lookup, so O(n).
  return build(0, inorder.length - 1);
}

// --- helper: tree -> LeetCode level-order array ---
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

test("105. Construct Binary Tree from Preorder and Inorder Traversal", () => {
  assert.deepEqual(toArray(buildTree([3, 9, 20, 15, 7], [9, 3, 15, 20, 7])), [3, 9, 20, null, null, 15, 7]);
  assert.deepEqual(toArray(buildTree([-1], [-1])), [-1]);
  // Left-skewed tree
  assert.deepEqual(toArray(buildTree([1, 2, 3], [3, 2, 1])), [1, 2, null, 3]);
  // Right-skewed tree
  assert.deepEqual(toArray(buildTree([1, 2, 3], [1, 2, 3])), [1, null, 2, null, 3]);
});
