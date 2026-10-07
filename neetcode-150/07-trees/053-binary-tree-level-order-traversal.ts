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

// @rule level holds exactly the nodes of one depth, left to right
// @why Returns the values grouped by depth, top level first.
// @goal what are the values of this tree, one row per depth, top to bottom?
export function levelOrder(root: TreeNode | null): number[][] {
  // @why Collects one array of values per level.
  // @phase Setup
  // @say A depth-first walk visits nodes in the wrong order and would need a depth tag on every node to regroup them. Instead process the tree one whole level at a time: the current level's children are exactly the next level.
  const result: number[][] = [];
  // @why `level` holds all nodes of the current depth; start with just the root (or nothing).
  // @say {root ? "The first level is just the root, " + root.val + "." : "Empty tree: no first level, so the loop below never runs."}
  let level: TreeNode[] = root ? [root] : [];

  // @why Keep going while the current level has any nodes.
  // @phase One level per pass: record it, then gather its children
  // @yes Level {result.length} has {level.length} {level.length === 1 ? "node" : "nodes"}: {JSON.stringify(level.map((n) => n.val))}.
  // @no No nodes left: the deepest level has been recorded.
  while (level.length) {
    // @why Record this whole level's values as one row.
    // @say Every node at this depth is in `level`, already in left-to-right order, so its values are one complete row.
    // @then Rows so far: {JSON.stringify(result)}.
    result.push(level.map((node) => node.val)); // @moment depth {result.length}
    // @why `next` will collect the children, which are the next level down.
    const next: TreeNode[] = [];
    // @why Visit every node on this level.
    // @say Take {node.val}. Its children belong to the next depth.
    for (const node of level) {
      // @why Queue the left child for the next level, if it exists.
      // @yes {node.val} has a left child {node.left.val}. Add it first so the next row stays left to right.
      // @no {node.val} has no left child.
      if (node.left) next.push(node.left);
      // @why Queue the right child too, so left-to-right order is kept.
      // @yes Add {node.val}'s right child {node.right.val} after any left child, so it lands to the right in the next row.
      // @no {node.val} has no right child.
      if (node.right) next.push(node.right);
    }
    // @why Move down one level and repeat.
    // @say Move down one depth: the children just gathered, {JSON.stringify(next.map((n) => n.val))}, are the whole next level.
    level = next; // @ask level.length
  }
  // @why Return all the rows.
  // @phase Answer
  // @returns {result.length} {result.length === 1 ? "row" : "rows"}. Each node entered one level and was read once, so O(n).
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
