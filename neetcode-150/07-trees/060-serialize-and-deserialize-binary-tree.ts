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
 *
 * Approach: Preorder DFS with null markers
 *   Serialize: write node values in preorder, using "N" for null children,
 *   joined by commas. Deserialize: read tokens in the same preorder; each
 *   token is either a null (return) or a node whose left then right subtree
 *   follow immediately.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: tree-dfs
 * Key insight: Preorder alone is ambiguous, but writing an explicit marker for every null
 *   child makes the encoding unique. The decoder reads tokens in the same order and
 *   always knows when a subtree ends.
 * Real world: Saving a scene graph, DOM or parse tree to a file or sending it over the
 *   network, then rebuilding the exact same structure on the other side.
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

// @rule tokens are written and read in the same order: root, then left, then right
// @why Turn a tree into a string that can be turned back into the same tree.
export function serialize(root: TreeNode | null): string {
  // @why Collect one token per node, in preorder.
  const out: string[] = [];
  // @why Visits nodes root, left, right.
  const dfs = (node: TreeNode | null): void => {
    // @why An empty spot must be recorded too, or we could not rebuild the shape.
    if (!node) {
      // @why Write "N" to mark a missing child.
      out.push("N");
      // @why Nothing below an empty spot, so stop.
      return;
    }
    // @why Write this node's value.
    out.push(String(node.val)); // @moment write {node.val}
    // @why Then write everything in the left subtree.
    dfs(node.left);
    // @why Then write everything in the right subtree.
    dfs(node.right);
  };
  // @why Start at the root.
  dfs(root);
  // @why Join the tokens into one string with commas.
  return out.join(",");
}

// @why Turn the string back into a tree.
export function deserialize(data: string): TreeNode | null {
  // @why Split the string back into the list of tokens.
  const tokens = data.split(",");
  // @why `i` is the next token to read; each call uses one.
  let i = 0;
  // @why Reads tokens in the same root, left, right order they were written.
  const dfs = (): TreeNode | null => {
    // @why Take the next token and move forward.
    const token = tokens[i++]; // @ask token
    // @why "N" means no node here, so return an empty subtree.
    if (token === "N") return null;
    // @why Make a node from the number token.
    const node = new TreeNode(Number(token)); // @moment rebuild {token}
    // @why The next tokens describe the left subtree, so build it first.
    node.left = dfs();
    // @why After the left side is finished, the following tokens are the right subtree.
    node.right = dfs();
    // @why Return this node with both children attached.
    return node;
  };
  // @why Kick off the rebuild from the first token.
  return dfs();
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
