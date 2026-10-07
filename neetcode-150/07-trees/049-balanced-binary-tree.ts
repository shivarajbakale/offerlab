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
// @goal does every node in this tree have left and right heights that differ by at most 1?
export function isBalanced(root: TreeNode | null): boolean {
  // Height of the subtree, or -1 if it is unbalanced.
  // @why Returns the height, but uses -1 as a signal that something below is unbalanced.
  // @phase Setup
  // @say Checking each node by computing both subtree heights from scratch is O(n²) on a long chain. Instead one bottom-up walk returns each subtree's height, and -1 as a "broken below" flag, so every node is checked once.
  // @goal how tall is the subtree under {node ? node.val : "this empty spot"}, or is something inside it unbalanced (-1)?
  const height = (node: TreeNode | null): number => {
    // @why An empty subtree is balanced and has height 0.
    // @phase Bottom-up: children report heights, this node checks the gap
    // @yes Empty spot: trivially balanced, and it adds no height.
    // @no Node {node.val}. Whether it is balanced depends on both children's heights, so get those first.
    // @returns 0: nothing here, and nothing here can be unbalanced.
    if (!node) return 0;
    // @why Get the left height first.
    // @say Ask {node.val}'s left side for its height.
    // @then Left of {node.val}: {l === -1 ? "already unbalanced somewhere" : "height " + l}.
    const l = height(node.left);
    // @why If the left side is already unbalanced, pass the bad news up without more work.
    // @yes Something under {node.val}'s left is unbalanced. One bad node makes the whole tree unbalanced, so skip the right side entirely.
    // @no The left side is fine, with height {l}. Now the right side.
    // @returns -1: pass "unbalanced" straight up, no more checking needed.
    if (l === -1) return -1;
    // @why Get the right height.
    // @say Ask {node.val}'s right side for its height.
    // @then Right of {node.val}: {r === -1 ? "already unbalanced somewhere" : "height " + r}.
    const r = height(node.right);
    // @why Unbalanced if the right side is bad, or the two heights differ by more than 1.
    // @yes {r === -1 ? "The right side is already unbalanced." : "Heights " + l + " and " + r + " differ by " + Math.abs(l - r) + ", more than 1, so " + node.val + " itself is lopsided."} The whole tree fails.
    // @no Both sides are balanced and their heights {l} and {r} differ by {Math.abs(l - r)}, at most 1, so {node.val} is balanced too.
    // @returns -1: report "unbalanced" up to the root.
    if (r === -1 || Math.abs(l - r) > 1) return -1;
    // @why Balanced here, so the real height is one more than the taller side.
    // @say The parent needs this subtree's real height: 1 + max({l}, {r}) = {1 + Math.max(l, r)}.
    const h = 1 + Math.max(l, r); // @ask h
    // @why Report it for the parent to check.
    // @returns {h}: the subtree under {node.val} is balanced and {h} {h === 1 ? "level" : "levels"} tall.
    return h;
  };
  // @why Any -1 anywhere means unbalanced; otherwise the whole tree is balanced.
  // @phase Answer
  // @say Run the walk from the root. A -1 from any node is passed straight up unchanged, so the root's result alone tells you about the whole tree.
  // @returns whether the root got a real height back instead of -1. Each node was visited once, so O(n).
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
