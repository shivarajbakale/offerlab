/**
 * 297. Serialize and Deserialize Binary Tree
 * Difficulty: Hard
 * Category: Trees
 * LeetCode: https://leetcode.com/problems/serialize-and-deserialize-binary-tree/
 *
 * Design an algorithm to convert a binary tree into a string (serialize) and
 * to rebuild the exact same tree from that string (deserialize). The format
 * is up to you, as long as deserialize(serialize(root)) reproduces the
 * original structure and values.
 *
 * Example 1:
 *   Input: root = [1, 2, 3, null, null, 4, 5]
 *   Output: [1, 2, 3, null, null, 4, 5]
 *
 * Example 2:
 *   Input: root = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 10^4
 *   -1000 <= Node.val <= 1000
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

export function serialize(root: TreeNode | null): string {
  // TODO: implement
  throw new Error("Not implemented");
}

export function deserialize(data: string): TreeNode | null {
  // TODO: implement
  throw new Error("Not implemented");
}

// --- helpers: LeetCode level-order array <-> tree ---
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

function toArray(root: TreeNode | null): (number | null)[] {
  const out: (number | null)[] = [];
  const queue: (TreeNode | null)[] = [root];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node) {
      out.push(node.val);
      queue.push(node.left, node.right);
    } else out.push(null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

const roundTrip = (values: (number | null)[]) => toArray(deserialize(serialize(buildTree(values))));

test("297. Serialize and Deserialize Binary Tree", () => {
  assert.deepEqual(roundTrip([1, 2, 3, null, null, 4, 5]), [1, 2, 3, null, null, 4, 5]);
  assert.deepEqual(roundTrip([]), []);
  assert.equal(serialize(buildTree([1, 2])), "1,2,N,N,N");
  // Negative values and a skewed shape
  assert.deepEqual(roundTrip([-1, null, -2, -3]), [-1, null, -2, -3]);
});
