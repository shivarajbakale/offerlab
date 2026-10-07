/**
 * 98. Validate Binary Search Tree
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/validate-binary-search-tree/
 *
 * Given the root of a binary tree, determine whether it is a valid binary
 * search tree: every node's left subtree holds only values strictly less
 * than the node, its right subtree only values strictly greater, and both
 * subtrees are themselves valid BSTs.
 *
 * Example 1:
 *   Input: root = [2, 1, 3]
 *   Output: true
 *
 * Example 2:
 *   Input: root = [5, 1, 4, null, null, 3, 6]
 *   Output: false   (4 is in the right subtree of 5 but is smaller)
 *
 * Constraints:
 *   1 <= number of nodes <= 10^4
 *   -2^31 <= Node.val <= 2^31 - 1
 *
 * Approach: DFS with valid (low, high) bounds
 *   Each node must lie strictly within bounds inherited from its ancestors.
 *   Going left tightens the upper bound to the node's value; going right
 *   tightens the lower bound.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: bst
 * Key insight: Comparing a node only with its children misses violations deeper down;
 *   every node must fit between bounds set by all its ancestors. Carrying (low, high)
 *   down the recursion checks that in one pass.
 * Real world: Integrity checks in databases and file systems that verify a B-tree's keys
 *   respect the key ranges of all parent pages.
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

// @rule every node lies strictly between the low and high bounds set by its ancestors
// @why A tree is a valid BST when every node fits inside the range set by its ancestors.
export function isValidBST(root: TreeNode | null): boolean {
  // @why `low` and `high` are the limits this node's value must stay strictly between.
  const valid = (node: TreeNode | null, low: number, high: number): boolean => {
    // @why An empty subtree cannot break any rule.
    if (!node) return true; // @say An empty subtree breaks no rules
    // @why Out of range means a duplicate or a misplaced value, so it is not a BST.
    if (node.val <= low || node.val >= high) return false; // @broken // @say {node.val} must lie strictly between ancestors' bounds ({low}, {high})
    // @why Going left, this value becomes the new upper limit for that whole side.
    const leftOk = valid(node.left, low, node.val); // @say Left side must stay below {node.val}, right side above it
    // @why Only check the right side (lower limit = this value) if the left side passed.
    const rightOk = leftOk && valid(node.right, node.val, high);
    // @why This subtree is valid only if both sides are.
    const ok = leftOk && rightOk; // @ask ok
    // @why Hand the verdict for this subtree up to the caller.
    return ok;
  };
  // @why The root has no limits yet, so start with -Infinity and Infinity.
  return valid(root, -Infinity, Infinity);
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

test("98. Validate Binary Search Tree", () => {
  assert.equal(isValidBST(buildTree([2, 1, 3])), true);
  assert.equal(isValidBST(buildTree([5, 1, 4, null, null, 3, 6])), false);
  // Duplicates are not allowed
  assert.equal(isValidBST(buildTree([2, 2, 2])), false);
  // Violation deeper than the immediate parent
  assert.equal(isValidBST(buildTree([5, 4, 6, null, null, 3, 7])), false);
  assert.equal(isValidBST(buildTree([2147483647])), true);
});
