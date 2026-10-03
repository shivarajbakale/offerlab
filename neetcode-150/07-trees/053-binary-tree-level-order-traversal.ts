/**
 * 102. Binary Tree Level Order Traversal
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/binary-tree-level-order-traversal/
 *
 * Given the root of a binary tree, return the values of its nodes level by
 * level, from top to bottom, and left to right within each level.
 *
 * Example 1:
 *   Input: root = [3, 9, 20, null, null, 15, 7]
 *   Output: [[3], [9, 20], [15, 7]]
 *
 * Example 2:
 *   Input: root = [1]
 *   Output: [[1]]
 *
 * Example 3:
 *   Input: root = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 2000
 *   -1000 <= Node.val <= 1000
 *
 * Approach: BFS
 *   Process the queue one level at a time: everything currently in the queue
 *   is one level; collect their values and enqueue their children.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: tree-bfs
 * Key insight: Processing the queue one whole level at a time gives a natural boundary
 *   between levels, so each level's values can be grouped without storing depths on
 *   nodes.
 * Real world: Showing an org chart or file tree level by level, or crawling a site
 *   breadth-first so pages close to the start URL are fetched first.
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

// @why Returns the values grouped by depth, top level first.
export function levelOrder(root: TreeNode | null): number[][] {
  // @why Collects one array of values per level.
  const result: number[][] = [];
  // @why `level` holds all nodes of the current depth; start with just the root (or nothing).
  let level: TreeNode[] = root ? [root] : [];

  // @why Keep going while the current level has any nodes.
  while (level.length) {
    // @why Record this whole level's values as one row.
    result.push(level.map((node) => node.val));
    // @why `next` will collect the children, which are the next level down.
    const next: TreeNode[] = [];
    // @why Visit every node on this level.
    for (const node of level) {
      // @why Queue the left child for the next level, if it exists.
      if (node.left) next.push(node.left);
      // @why Queue the right child too, so left-to-right order is kept.
      if (node.right) next.push(node.right);
    }
    // @why Move down one level and repeat.
    level = next;
  }
  // @why Return all the rows.
  return result;
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

test("102. Binary Tree Level Order Traversal", () => {
  assert.deepEqual(levelOrder(buildTree([3, 9, 20, null, null, 15, 7])), [[3], [9, 20], [15, 7]]);
  assert.deepEqual(levelOrder(buildTree([1])), [[1]]);
  assert.deepEqual(levelOrder(buildTree([])), []);
  assert.deepEqual(levelOrder(buildTree([1, 2, null, 3, null, 4])), [[1], [2], [3], [4]]);
});
