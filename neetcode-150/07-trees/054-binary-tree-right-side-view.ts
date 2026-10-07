/**
 * 199. Binary Tree Right Side View
 * Difficulty: Medium
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/binary-tree-right-side-view/
 *
 * Imagine standing to the right of a binary tree. Return the values of the
 * nodes you can see, ordered from top to bottom (i.e. the rightmost node on
 * each level).
 *
 * Example 1:
 *   Input: root = [1, 2, 3, null, 5, null, 4]
 *   Output: [1, 3, 4]
 *
 * Example 2:
 *   Input: root = [1, 2, 3, 4, null, null, null, 5]
 *   Output: [1, 3, 4, 5]
 *
 * Example 3:
 *   Input: root = [1, null, 3]
 *   Output: [1, 3]
 *
 * Example 4:
 *   Input: root = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 100
 *   -100 <= Node.val <= 100
 *
 * Approach: BFS by level
 *   Traverse level by level and record the last node of every level.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: tree-bfs
 * Key insight: The node visible from the right is simply the last node of each level in
 *   left-to-right order, so a level-by-level BFS that records each level's last element
 *   is enough.
 * Real world: Computing which item is visible at each depth in a nested layout, such as
 *   the rightmost node shown per row when drawing a collapsed tree view.
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

// @rule level holds one depth left to right, so its last node is the one seen from the right
// @why The right side view is the last node of every level, seen from the right.
export function rightSideView(root: TreeNode | null): number[] {
  // @why Collects one visible value per level.
  const result: number[] = [];
  // @why `level` holds all nodes of the current depth; start with just the root (or nothing).
  let level: TreeNode[] = root ? [root] : [];

  // @why Keep going while the current level has any nodes.
  while (level.length) {
    // @why The rightmost node on this level is the one visible from the right side.
    result.push(level[level.length - 1].val); // @ask result[result.length-1] // @moment see {level[level.length - 1].val}
    // @why `next` will collect the children, which are the next level down.
    const next: TreeNode[] = [];
    // @why Visit every node on this level.
    for (const node of level) {
      // @why Queue the left child, if any, for the next level.
      if (node.left) next.push(node.left);
      // @why Queue the right child after it so it ends up last in the row.
      if (node.right) next.push(node.right);
    }
    // @why Move down one level and repeat.
    level = next; // @ask level.length
  }
  // @why Return the visible values from top to bottom.
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

test("199. Binary Tree Right Side View", () => {
  assert.deepEqual(rightSideView(buildTree([1, 2, 3, null, 5, null, 4])), [1, 3, 4]);
  assert.deepEqual(rightSideView(buildTree([1, 2, 3, 4, null, null, null, 5])), [1, 3, 4, 5]);
  assert.deepEqual(rightSideView(buildTree([1, null, 3])), [1, 3]);
  assert.deepEqual(rightSideView(buildTree([])), []);
});
