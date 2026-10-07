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
 *
 * Approach: DFS + Same Tree check
 *   At every node of `root`, check whether the tree rooted there equals
 *   `subRoot`; otherwise recurse into the left and right children.
 *
 * Time: O(m * n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: Any match must be rooted at some node of the big tree, so try the
 *   same-tree check at every node. The check fails fast on the first differing value, so
 *   most attempts end quickly.
 * Real world: Code clone detectors search an abstract syntax tree for a subtree identical
 *   to a given snippet's tree.
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

// @why Helper: checks if two trees are exactly equal, used on each candidate spot.
function isSameTree(p: TreeNode | null, q: TreeNode | null): boolean {
  // @why Both empty at the same spot means they match here.
  if (!p && !q) return true;
  // @why Only one is empty, or the values differ, so they are not equal.
  if (!p || !q || p.val !== q.val) return false;
  // @why This node matches; now both left subtrees and both right subtrees must match too.
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}

// @rule isSubtree(root) returns whether subRoot appears exactly somewhere under root
// @why Is `subRoot` somewhere inside `root`, matching a node and everything below it?
export function isSubtree(root: TreeNode | null, subRoot: TreeNode | null): boolean {
  // @why An empty tree is a subtree of anything, so answer true right away.
  if (!subRoot) return true; // empty tree is a subtree of anything
  // @why We ran out of `root` and never found a match, so false.
  if (!root) return false;
  // @why Try matching `subRoot` starting at this very node.
  if (isSameTree(root, subRoot)) return true; // @moment try {root.val}
  // @why No match here, so look for it in the left side first.
  const inLeft = isSubtree(root.left, subRoot);
  // @why Only search the right side if the left side had no match.
  const inRight = !inLeft && isSubtree(root.right, subRoot);
  // @why Found under this node if either side has it.
  const found = inLeft || inRight; // @ask found
  // @why Pass the answer for this subtree up to the caller.
  return found;
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
