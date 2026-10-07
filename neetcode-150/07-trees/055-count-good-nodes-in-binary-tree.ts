/**
 * 1448. Count Good Nodes in Binary Tree
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/count-good-nodes-in-binary-tree/
 *
 * A node X in a binary tree is "good" if no node on the path from the root
 * to X has a value greater than X's value. Return the number of good nodes.
 *
 * Example 1:
 *   Input: root = [3, 1, 4, 3, null, 1, 5]
 *   Output: 4   (3, 4, 5 and the lower 3)
 *
 * Example 2:
 *   Input: root = [3, 3, null, 4, 2]
 *   Output: 3
 *
 * Example 3:
 *   Input: root = [1]
 *   Output: 1
 *
 * Constraints:
 *   1 <= number of nodes <= 10^5
 *   -10^4 <= Node.val <= 10^4
 *
 * Approach: DFS carrying the path maximum
 *   Pass down the largest value seen so far on the path. A node is good if
 *   its value is >= that max; then update the max for its children.
 *
 * Time: O(n)   Space: O(h) recursion stack
 *
 * Pattern: tree-dfs
 * Key insight: Whether a node is good depends only on the maximum on its root-to-node
 *   path, so passing that single number down the recursion replaces storing the whole
 *   path.
 * Real world: Flagging new all-time highs along each branch of a hierarchy, like a
 *   manager chain where an employee is flagged if their score beats everyone above them.
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

// @rule maxSoFar is the largest value on the path from the root down to node
// @why A node is good if no node on the path from the root to it is bigger.
// @goal how many nodes have nothing bigger on the path from the root down to them?
export function goodNodes(root: TreeNode | null): number {
  // @why `maxSoFar` is the biggest value on the path from the root to here.
  // @phase Setup
  // @say Re-walking the path from the root for every node is O(n·h). But "is anything above me bigger?" only needs the largest value above, so pass that one number down as you go.
  // @goal how many good nodes are under {node ? node.val : "this empty spot"}, when the biggest value above it is {maxSoFar}?
  const dfs = (node: TreeNode | null, maxSoFar: number): number => {
    // @why An empty subtree has no good nodes.
    // @phase Judge this node, then pass the path max down
    // @yes Empty spot: nothing to count.
    // @no Node {node.val}, with {maxSoFar === -Infinity ? "nothing above it" : "path max " + maxSoFar + " above it"}.
    // @returns 0: an empty subtree has no good nodes.
    if (!node) return 0;
    // @why This node is good if it is at least as big as everything above it.
    // @say {maxSoFar === -Infinity ? node.val + " is the root, with nothing above it, so it is good." : node.val >= maxSoFar ? node.val + " ≥ " + maxSoFar + ", the biggest value above it, so nothing on its path beats it: good." : node.val + " < " + maxSoFar + ", and " + maxSoFar + " sits above it on the path: not good."}
    const good = node.val >= maxSoFar ? 1 : 0; // @ask good
    // @why The new path maximum for the children: the bigger of the old one and this node.
    // @say Children see everything above them, which now includes {node.val}: max({maxSoFar}, {node.val}) = {Math.max(maxSoFar, node.val)}.
    const max = Math.max(maxSoFar, node.val);
    // @why Count the good nodes in the left subtree.
    // @say Count good nodes on {node.val}'s left, passing max {max} down.
    // @then {left} good {left === 1 ? "node" : "nodes"} on the left of {node.val}.
    const left = dfs(node.left, max);
    // @why Count the good nodes in the right subtree.
    // @say Same for {node.val}'s right side, with max {max}.
    // @then {right} good {right === 1 ? "node" : "nodes"} on the right of {node.val}.
    const right = dfs(node.right, max);
    // @why Count this node plus the good nodes found in both subtrees.
    // @say {good} for {node.val} itself + {left} left + {right} right = {good + left + right}.
    const count = good + left + right; // @ask count
    // @why Hand the count up to the parent.
    // @returns {count} good {count === 1 ? "node" : "nodes"} in the subtree under {node.val}.
    return count;
  };
  // @why Start at the root with -Infinity so the root is always good.
  // @phase Walk from the root
  // @say Start with -Infinity as the "max above": nothing is above the root, so the root always counts as good.
  // @returns the total good nodes. Each node was judged once, O(n).
  return dfs(root, -Infinity);
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

test("1448. Count Good Nodes in Binary Tree", () => {
  assert.equal(goodNodes(buildTree([3, 1, 4, 3, null, 1, 5])), 4);
  assert.equal(goodNodes(buildTree([3, 3, null, 4, 2])), 3);
  assert.equal(goodNodes(buildTree([1])), 1);
  assert.equal(goodNodes(buildTree([5, 4, 3, 2, 1])), 1);
});
