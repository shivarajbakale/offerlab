/**
 * 138. Copy List with Random Pointer
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/copy-list-with-random-pointer/
 *
 * A linked list of length n has nodes with an extra `random` pointer that
 * may point to any node in the list or be null. Build a deep copy: n brand
 * new nodes whose `next` and `random` pointers mirror the original structure
 * but point only at new nodes. Return the head of the copy.
 *
 * The list is described as [val, random_index] pairs, where random_index is
 * the index of the node `random` points to, or null.
 *
 * Example 1:
 *   Input: head = [[7,null],[13,0],[11,4],[10,2],[1,0]]
 *   Output: [[7,null],[13,0],[11,4],[10,2],[1,0]]
 *
 * Example 2:
 *   Input: head = [[1,1],[2,1]]
 *   Output: [[1,1],[2,1]]
 *
 * Example 3:
 *   Input: head = [[3,null],[3,0],[3,null]]
 *   Output: [[3,null],[3,0],[3,null]]
 *
 * Constraints:
 *   0 <= n <= 1000
 *   -10^4 <= Node.val <= 10^4
 *   Node.random is null or points to a node in the list.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class _Node {
  val: number;
  next: _Node | null;
  random: _Node | null;
  constructor(val = 0, next: _Node | null = null, random: _Node | null = null) {
    this.val = val;
    this.next = next;
    this.random = random;
  }
}

export function copyRandomList(head: _Node | null): _Node | null {
  // TODO: implement
  throw new Error("Not implemented");
}

type Pair = [number, number | null];

function fromPairs(pairs: Pair[]): _Node | null {
  const nodes = pairs.map(([v]) => new _Node(v));
  nodes.forEach((node, i) => {
    node.next = nodes[i + 1] ?? null;
    const r = pairs[i][1];
    node.random = r === null ? null : nodes[r];
  });
  return nodes[0] ?? null;
}

function toPairs(head: _Node | null): Pair[] {
  const nodes: _Node[] = [];
  for (let n = head; n; n = n.next) nodes.push(n);
  return nodes.map((n) => [n.val, n.random ? nodes.indexOf(n.random) : null]);
}

function collect(head: _Node | null): Set<_Node> {
  const s = new Set<_Node>();
  for (let n = head; n; n = n.next) s.add(n);
  return s;
}

test("138. Copy List with Random Pointer", () => {
  const cases: Pair[][] = [
    [[7, null], [13, 0], [11, 4], [10, 2], [1, 0]],
    [[1, 1], [2, 1]],
    [[3, null], [3, 0], [3, null]],
    [],
  ];
  for (const pairs of cases) {
    const original = fromPairs(pairs);
    const copy = copyRandomList(original);
    assert.deepEqual(toPairs(copy), pairs);
    // Deep copy: no node is shared with the original.
    const orig = collect(original);
    for (const n of collect(copy)) assert.equal(orig.has(n), false);
  }
});
