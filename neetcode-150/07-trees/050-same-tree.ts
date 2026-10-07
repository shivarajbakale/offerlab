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
 *
 * Pattern: tree-dfs
 * Key insight: Two trees are equal exactly when their roots match and both pairs of
 *   subtrees are equal, so the comparison recurses in lockstep and stops at the first
 *   mismatch.
 * Real world: Virtual DOM diffing in UI frameworks walks the old and new trees together
 *   to find which subtrees changed.
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

// @rule each call returns whether the two subtrees at this spot match exactly
// @why Two trees are the same if they have the same shape and the same values.
// @goal do the subtrees at {p ? p.val : "an empty spot"} and {q ? q.val : "an empty spot"} have the same shape and values?
export function isSameTree(p: TreeNode | null, q: TreeNode | null): boolean {
  // @why Both empty at the same spot means they match here.
  // @phase Compare this spot in both trees
  // @yes Both trees are empty here, so they agree at this spot.
  // @no At least one tree has a node here, so compare them.
  // @returns true: two empty spots are identical.
  if (!p && !q) return true;
  // @why Only one is empty, or the values differ, so the trees cannot be the same.
  // @yes {!p || !q ? "Only one tree has a node here, so the shapes differ." : "Values differ: " + p.val + " vs " + q.val + "."} One mismatch anywhere means the trees are different.
  // @no Both have {p.val} here. That only settles this spot; the subtrees below must match too.
  // @returns false: a mismatch here makes the whole answer false.
  if (!p || !q || p.val !== q.val) return false;
  // @why This node matches; now check whether the two left subtrees match.
  // @phase Recurse into matching children
  // @say Comparing traversals as lists can be fooled by different shapes giving the same order. Walking both trees in lockstep compares shape and values together. Left children of {p.val} first.
  // @then Left subtrees under {p.val}: {leftSame ? "identical" : "different"}.
  const leftSame = isSameTree(p.left, q.left);
  // @why Only check the right sides if the left sides already match.
  // @say {leftSame ? "Left sides match, so the right sides decide." : "Left sides already differ, so skip the right sides: the answer is no either way."}
  const rightSame = leftSame && isSameTree(p.right, q.right);
  // @why The two subtrees here match only if both sides do.
  // @say Same here only if both sides are: {leftSame} and {rightSame}.
  const same = leftSame && rightSame; // @ask same
  // @why Hand the verdict for this spot up to the caller.
  // @returns {same}: the subtrees at {p.val} {same ? "match exactly" : "differ somewhere"}.
  return same;
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
