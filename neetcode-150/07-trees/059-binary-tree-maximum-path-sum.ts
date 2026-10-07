/**
 * 124. Binary Tree Maximum Path Sum
 * Difficulty: Hard
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/binary-tree-maximum-path-sum/
 *
 * A path in a binary tree is a sequence of nodes where each adjacent pair is
 * connected by an edge, and no node appears more than once. The path need
 * not pass through the root and contains at least one node. Its sum is the
 * total of its node values. Given the root, return the maximum path sum.
 *
 * Example 1:
 *   Input: root = [1, 2, 3]
 *   Output: 6   (2 -> 1 -> 3)
 *
 * Example 2:
 *   Input: root = [-10, 9, 20, null, null, 15, 7]
 *   Output: 42  (15 -> 20 -> 7)
 *
 * Constraints:
 *   1 <= number of nodes <= 3 * 10^4
 *   -1000 <= Node.val <= 1000
 *
 * Approach: DFS returning the best downward "gain"
 *   For each node, compute the best sum of a path that starts at the node and
 *   goes down one side (negative gains are dropped, i.e. clamped to 0). The
 *   best path that "bends" at this node is val + leftGain + rightGain; track
 *   the max of that globally, and return val + max(leftGain, rightGain) to
 *   the parent, since a path can only continue upward through one child.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: A path can bend at only one node, so each node returns the best
 *   single-branch gain to its parent while separately scoring the bent path through
 *   itself. Clamping negative gains to 0 means a bad branch is simply not taken.
 * Real world: Finding the most profitable route through a tree of network links or
 *   pipeline stages where some segments cost more than they earn.
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

// @viz best:best
// @rule gain returns the best downward sum from its node; best is the best bend seen so far
// @why Find the largest sum along any path; it may start and end anywhere.
// @goal what is the largest sum along any path in this tree?
export function maxPathSum(root: TreeNode | null): number {
  // @why `best` is the highest path sum seen so far; start very low since values can be negative.
  // @phase Setup
  // @say Trying every pair of endpoints is O(n²) paths. But every path has one highest node where it bends, so at each node combine the best way down its left and its right. -Infinity, not 0, because an all-negative tree still has an answer.
  let best = -Infinity;

  // @why Returns the best sum of a path that starts here and goes down one side only.
  // @goal what is the best sum going straight down from {node ? node.val : "this empty spot"}, and does a path bending here beat the best?
  const gain = (node: TreeNode | null): number => {
    // @why An empty subtree adds nothing.
    // @phase Post-order: children report their best downward sums
    // @yes Empty spot: nothing to add.
    // @no Node {node.val}. The best path bending here needs the best downward sums from both children first.
    // @returns 0: an empty side contributes nothing.
    if (!node) return 0;
    // @why Take the left gain, but ignore it if negative, since skipping it is better.
    // @say Ask how much the left side of {node.val} can add. If it would subtract, take 0 instead: you can always stop the path at {node.val}.
    // @then Left of {node.val} adds {left}.
    const left = Math.max(gain(node.left), 0);
    // @why Same for the right side.
    // @say Same for the right side of {node.val}.
    // @then Right of {node.val} adds {right}.
    const right = Math.max(gain(node.right), 0);
    // @why A path bending at this node uses both sides, so check if it beats `best`.
    // @say A path bending at {node.val}: {left} + {node.val} + {right} = {node.val + left + right}. Best so far {best}. {node.val + left + right > best ? "New best." : "Not better, so best stays."}
    best = Math.max(best, node.val + left + right); // @ask best
    // @why The parent can only extend one side, so take this node plus the better side.
    // @say A path going up through the parent can't use both sides of {node.val}, or it would fork. Offer {node.val} + max({left}, {right}) = {node.val + Math.max(left, right)}.
    const down = node.val + Math.max(left, right); // @ask down
    // @why Pass that one-sided gain up to the parent.
    // @returns {down}: the best sum of a path from {node.val} straight down.
    return down;
  };

  // @why Start at the root; `best` gets filled in along the way.
  // @phase Walk every node once
  // @say Start at the root. Its return value is only the one-sided gain; the answer collects in `best`.
  gain(root);
  // @why After visiting every node, `best` is the answer.
  // @phase Answer
  // @returns {best}: every node was tried as the bend point once, so O(n).
  return best;
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

test("124. Binary Tree Maximum Path Sum", () => {
  assert.equal(maxPathSum(buildTree([1, 2, 3])), 6);
  assert.equal(maxPathSum(buildTree([-10, 9, 20, null, null, 15, 7])), 42);
  // All negative: best path is the single largest node
  assert.equal(maxPathSum(buildTree([-3, -2, -1])), -1);
  assert.equal(maxPathSum(buildTree([2, -1])), 2);
});
