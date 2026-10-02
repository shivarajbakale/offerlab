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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

export function hasCycle(head: ListNode | null): boolean {
  let slow = head;
  let fast = head;
  while (fast && fast.next) {
    slow = slow!.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
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
