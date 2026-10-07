/**
 * 141. Linked List Cycle
 * Difficulty: Easy
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/linked-list-cycle/
 *
 * Given the head of a linked list, return true if some node can be reached
 * again by continuously following `next` (i.e. the list has a cycle),
 * otherwise return false. (`pos` in the examples is the index the tail links
 * back to, or -1 for no cycle; it is not passed to the function.)
 *
 * Example 1:
 *   Input: head = [3, 2, 0, -4], pos = 1
 *   Output: true
 *
 * Example 2:
 *   Input: head = [1, 2], pos = 0
 *   Output: true
 *
 * Example 3:
 *   Input: head = [1], pos = -1
 *   Output: false
 *
 * Constraints:
 *   0 <= number of nodes <= 10^4
 *   -10^5 <= Node.val <= 10^5
 *
 * Approach: Floyd's tortoise and hare
 *   Move `slow` one step and `fast` two steps at a time. If there is a cycle
 *   fast eventually laps slow and they meet; otherwise fast hits null.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: fast-slow-pointers
 * Key insight: Once both pointers are inside a cycle, the gap between them shrinks by
 *   exactly one node per step, so fast cannot jump over slow and must land on it. Without
 *   a cycle fast simply reaches null.
 * Real world: Garbage collectors and serializers detecting circular references, and
 *   Pollard's rho factoring, which uses the same tortoise-and-hare walk to find a
 *   repeated value in O(1) memory.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A node holds one value and a link to the next node.
export class ListNode {
  // @why The value stored in this node.
  val: number;
  // @why Link to the next node, or null at the end of the list.
  next: ListNode | null;
  constructor(val = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

// @rule fast has always taken twice as many steps as slow from the head
// @why Return true if following `next` ever loops back.
// @goal does following next from this head ever loop back?
export function hasCycle(head: ListNode | null): boolean {
  // @why `slow` is the tortoise.
  // @phase Setup: two runners at the head
  // @say Remembering every visited node in a set works but costs O(n) space. Instead send two runners, one twice as fast: with no loop the fast one hits the end; with a loop it can't escape, and it gains one node per round on the slow one until it lands on it.
  let slow = head;
  // @why `fast` is the hare; both start at the head.
  let fast = head;
  // @why Fast moves two at a time, so it needs two nodes ahead; running out means the list ended.
  // @phase Race: the hare gains one node per round
  // @yes The hare, on {fast.val}, has two more nodes to step onto, so the race goes on.
  // @no The hare {fast ? "is on the last node" : "ran off the end"}. A list with a loop has no end, so there is no loop to trap it.
  while (fast && fast.next) {
    // @why The tortoise takes one step.
    // @say Tortoise steps from {slow.val} to {slow.next.val}.
    slow = slow!.next; // @ask slow?.val
    // @why The hare takes two steps, so it gains one node per round.
    // @say Hare jumps from {fast.val} to {fast.next.next ? fast.next.next.val : "past the end"}, gaining one node on the tortoise.
    fast = fast.next.next; // @ask fast?.val
    // @why If they ever stand on the same node, the list must loop.
    // @yes Both runners stand on the same node, {slow.val}. The hare could only come back to the tortoise by going around a loop.
    // @no {fast ? "Hare on " + fast.val + ", tortoise on " + slow.val + ": not the same node yet." : "Hare fell off the end."} If there is a loop, the gap between them shrinks by one each round, so it can't jump over the tortoise.
    // @returns true: the runners met, so the list loops. O(n) time and O(1) space.
    if (slow === fast) return true; // @moment {slow === fast ? "caught at " + slow.val : "no meet yet"}
  }
  // @why The hare reached the end, so there is no cycle.
  // @phase Answer
  // @returns false: the list has an end, so following next never loops back.
  return false;
}

/** Build a list from values; link the tail back to index `pos` (-1 = none). */
function fromArrayWithCycle(arr: number[], pos: number): ListNode | null {
  const nodes = arr.map((v) => new ListNode(v));
  nodes.forEach((n, i) => (n.next = nodes[i + 1] ?? null));
  if (pos >= 0 && nodes.length) nodes[nodes.length - 1].next = nodes[pos];
  return nodes[0] ?? null;
}

test("141. Linked List Cycle", () => {
  assert.equal(hasCycle(fromArrayWithCycle([3, 2, 0, -4], 1)), true);
  assert.equal(hasCycle(fromArrayWithCycle([1, 2], 0)), true);
  assert.equal(hasCycle(fromArrayWithCycle([1], -1)), false);
  assert.equal(hasCycle(fromArrayWithCycle([], -1)), false);
  assert.equal(hasCycle(fromArrayWithCycle([1], 0)), true); // self-loop
});
