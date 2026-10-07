/**
 * 543. Diameter of Binary Tree
 * Difficulty: Easy
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/diameter-of-binary-tree/
 *
 * Given the root of a binary tree, return the length of its diameter: the
 * number of edges on the longest path between any two nodes. The path may or
 * may not pass through the root.
 *
 * Example 1:
 *   Input: root = [1, 2, 3, 4, 5]
 *   Output: 3   (path 4 -> 2 -> 1 -> 3 or 5 -> 2 -> 1 -> 3)
 *
 * Example 2:
 *   Input: root = [1, 2]
 *   Output: 1
 *
 * Constraints:
 *   1 <= number of nodes <= 10^4
 *   -100 <= Node.val <= 100
 *
 * Approach: DFS returning height
 *   For each node, the longest path through it is height(left) + height(right).
 *   Track the max of that while returning 1 + max(height(left), height(right)).
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: The longest path must bend at some highest node, where its length is
 *   height(left) + height(right). One post-order pass that returns heights can compute
 *   that at every node and keep the best, instead of recomputing heights per node.
 * Real world: Finding the two most distant routers in a tree-shaped network (the
 *   worst-case hop count) to size timeouts.
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
// @rule height returns its subtree's height; best is the longest bend l + r seen so far
// @why The diameter is the longest path (counted in edges) between any two nodes.
// @goal what is the longest path between any two nodes of this tree?
export function diameterOfBinaryTree(root: TreeNode | null): number {
  // @why `best` remembers the longest path seen at any node so far.
  // @phase Setup
  // @say Any longest path bends at exactly one node: its highest point. So the answer is, over every node, (deepest path down-left) + (deepest path down-right). One walk that returns heights gives both sides at every node.
  let best = 0;

  // @why Returns a subtree's height, and updates `best` as a side effect.
  // @goal how tall is the subtree under {node ? node.val : "this empty spot"}, and what is the longest bend inside it?
  const height = (node: TreeNode | null): number => {
    // @why An empty subtree has height 0.
    // @phase Post-order: ask both children, then decide at this node
    // @yes Empty spot: no nodes, so no edges going down.
    // @no Node {node.val}. Its best bend needs both children's heights first, so ask them before doing anything here.
    // @returns 0, so a leaf above sees "nothing below me on this side".
    if (!node) return 0;
    // @why Height of the left subtree, which is the longest path going down-left.
    // @say Ask the left child: how far down can a path go on {node.val}'s left side?
    // @then Left side of {node.val} goes {l} deep.
    const l = height(node.left);
    // @why Height of the right subtree, which is the longest path going down-right.
    // @say Ask the right child the same question for {node.val}'s right side.
    // @then Right side of {node.val} goes {r} deep.
    const r = height(node.right);
    // @why A path bending at this node uses both sides, so its length is `l + r`; keep the max.
    // @say A path bending at {node.val} goes {l} down the left and {r} down the right: {l + r} edges. Best so far was {best}. {l + r > best ? "New longest path." : "Not longer, so best stays."}
    best = Math.max(best, l + r); // @ask best
    // @why Our height is one more than our taller side.
    // @say The parent can only continue a path down ONE side of {node.val}, not bend twice, so pass up the taller side plus the edge to {node.val}: 1 + max({l}, {r}) = {1 + Math.max(l, r)}.
    const h = 1 + Math.max(l, r); // @ask h
    // @why Tell the parent our height.
    // @returns {h}: a path entering {node.val} from above can reach {h} {h === 1 ? "edge" : "edges"} down.
    return h;
  };

  // @why Start the walk at the root; we only care about the `best` it fills in.
  // @phase Walk the whole tree once
  // @say Start at the root. Its return value is just the height; the answer is collected in `best` along the way.
  height(root);
  // @why After visiting every node, `best` is the longest path anywhere.
  // @phase Answer
  // @returns {best}: every node was considered as the bend point exactly once, so O(n).
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

test("543. Diameter of Binary Tree", () => {
  assert.equal(diameterOfBinaryTree(buildTree([1, 2, 3, 4, 5])), 3);
  assert.equal(diameterOfBinaryTree(buildTree([1, 2])), 1);
  assert.equal(diameterOfBinaryTree(buildTree([1])), 0);
  // Longest path does not pass through the root
  assert.equal(diameterOfBinaryTree(buildTree([1, 2, null, 3, 4, 5, null, null, 6, 7, null, null, 8])), 6);
});
