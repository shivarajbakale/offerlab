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
 *
 * Approach: Two passes with an old -> new hash map
 *   Pass 1 creates a copy of every node and records old -> copy in a map.
 *   Pass 2 wires each copy's next and random through the map.
 *
 * Time: O(n)   Space: O(n)
 *
 * Pattern: linked-list,hashing
 * Key insight: The random pointer can aim at a node that has not been copied yet, so
 *   copying and wiring cannot happen in one pass. Building every copy first and keeping
 *   an old -> new map turns any original pointer into its copy with one lookup.
 * Real world: Deep-cloning an object graph with shared references (structuredClone, a
 *   game engine duplicating a scene), where a visited map keeps aliased objects aliased
 *   in the clone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A node with an extra `random` pointer that can point to any node.
export class _Node {
  // @why The value stored in this node.
  val: number;
  // @why Link to the next node.
  next: _Node | null;
  // @why Link to any node in the list, or null.
  random: _Node | null;
  constructor(val = 0, next: _Node | null = null, random: _Node | null = null) {
    this.val = val;
    this.next = next;
    this.random = random;
  }
}

// @rule every original node has its copy in map before any copy link is wired
// @why Return a deep copy: brand new nodes with the same shape.
// @goal how do you build a brand-new copy of this list, random links included?
export function copyRandomList(head: _Node | null): _Node | null {
  // @why Map each original node to its copy, so we can find any copy instantly.
  // @phase Setup: a lookup from each original node to its copy
  // @say Copying node by node in one pass fails: a random link can point at a node whose copy doesn't exist yet. So split the work: first make every copy, then wire links, looking up "the copy of node X" in a map in O(1).
  const map = new Map<_Node, _Node>();

  // @why Pass 1: make a copy of every node (values only) and remember it.
  // @phase Pass 1: make every copy, no links yet
  // @yes Original {cur.val} has no copy yet.
  // @no Every original node has a copy ({map.size} in all), so any link can now be pointed at a copy.
  // @say Make a fresh node with value {cur.val} and record original {cur.val} → its copy.
  for (let cur = head; cur; cur = cur.next) map.set(cur, new _Node(cur.val));

  // @why Pass 2: now that all copies exist, we can wire up their links.
  // @phase Pass 2: wire each copy's links to other copies
  // @yes Original {cur.val}'s copy still needs its next and random links.
  // @no Every copy is wired: it links only to other copies, never back into the original list.
  for (let cur = head; cur; cur = cur.next) {
    // @why Look up this node's copy.
    // @say Find the copy of {cur.val} in the map.
    const copy = map.get(cur)!;
    // @why Point the copy's `next` at the copy of the next node, not the original.
    // @say {cur.next ? "The original's next is " + cur.next.val + ", so point the copy at the copy of " + cur.next.val + ", not the original." : "The original is the last node, so the copy's next is null."}
    copy.next = cur.next ? map.get(cur.next)! : null; // @ask copy.next?.val
    // @why Same for `random`: point at the copy of the random target.
    // @say {cur.random ? "The original's random is " + cur.random.val + ". Its copy already exists from pass 1, so the map hands it over." : "The original's random is null, so the copy's is too."}
    copy.random = cur.random ? map.get(cur.random)! : null; // @moment wire random of {cur.val}
  }
  // @why The copy of the head is the head of the new list.
  // @phase Answer
  // @returns {head ? "the copy of " + head.val + ", head of the new list. Two passes and a map: O(n) time and O(n) space." : "null: an empty list copies to an empty list."}
  return head ? map.get(head)! : null;
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
