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

export class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

export function rightSideView(root: TreeNode | null): number[] {
  const result: number[] = [];
  let level: TreeNode[] = root ? [root] : [];

  while (level.length) {
    result.push(level[level.length - 1].val);
    const next: TreeNode[] = [];
    for (const node of level) {
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    level = next;
  }
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
