/**
 * 206. Reverse Linked List
 * Difficulty: Easy
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/reverse-linked-list/
 *
 * Given the head of a singly linked list, reverse the list and return the
 * new head.
 *
 * Example 1:
 *   Input: head = [1, 2, 3, 4, 5]
 *   Output: [5, 4, 3, 2, 1]
 *
 * Example 2:
 *   Input: head = [1, 2]
 *   Output: [2, 1]
 *
 * Example 3:
 *   Input: head = []
 *   Output: []
 *
 * Constraints:
 *   0 <= number of nodes <= 5000
 *   -5000 <= Node.val <= 5000
 *
 * Approach: Iterative pointer reversal
 *   Walk the list keeping `prev`; for each node, save next, point the node
 *   back at prev, then advance. `prev` ends up as the new head.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: linked-list
 * Key insight: Reversing needs only one saved pointer: keep the next node before
 *   overwriting cur.next, and the rest of the list is never lost.
 * Real world: Undo history or a browser back stack that flips a singly linked chain of
 *   actions in place to replay it in the other direction.
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

// @rule prev holds the reversed nodes, cur..end is untouched; no node is lost
// @why Return the new head, which is the old tail.
// @goal how do you turn every arrow of this list around?
export function reverseList(head: ListNode | null): ListNode | null {
  // @why `prev` is the already-reversed part; it starts empty.
  // @phase Setup: two pointers split the list into done and not done
  // @say Copying values into an array and rebuilding takes O(n) extra space. Instead flip each arrow in place, which needs to remember just two things: the reversed part (`prev`) and the next node to flip (`cur`).
  let prev: ListNode | null = null;
  // @why `cur` is the node we are flipping right now.
  let cur = head;
  // @why Stop when every node has been flipped.
  // @phase Flip one arrow per step
  // @yes Node {cur.val} still points forward, so flip it.
  // @no `cur` fell off the end: every arrow has been flipped.
  while (cur) {
    // @why Save the rest of the list first, or flipping the link would lose it.
    // @say {cur.next ? "Remember " + cur.next.val + " and everything after it" : "Nothing comes after " + cur.val + ", but save that too"}. The next line overwrites {cur.val}'s only link forward, and without this the rest of the list would be lost.
    const next: ListNode | null = cur.next;
    // @why The actual reversal: point this node backward.
    // @say Flip the arrow: {cur.val} now points back to {prev ? prev.val : "nothing (it will be the new tail)"}.
    cur.next = prev; // @ask cur.next?.val // @moment flip {cur.val}
    // @why Grow the reversed part by one node.
    // @say {cur.val} is now the front of the reversed part.
    prev = cur;
    // @why Move on to the saved rest of the list.
    // @say Step forward to the saved remainder{next ? ", starting at " + next.val : ""}.
    // @then Reversed so far starts at {prev.val}; still to flip: {cur ? "from " + cur.val : "nothing"}.
    cur = next; // @ask cur?.val
  }
  // @why When `cur` runs out, `prev` is the last node seen, which is the new head.
  // @returns the old tail{prev ? ", " + prev.val : ""}, which is now the head. Each node was touched once, O(n) time and O(1) space.
  return prev;
}

function fromArray(arr: number[]): ListNode | null {
  let head: ListNode | null = null;
  for (let i = arr.length - 1; i >= 0; i--) head = new ListNode(arr[i], head);
  return head;
}

function toArray(head: ListNode | null): number[] {
  const out: number[] = [];
  for (let n = head; n; n = n.next) out.push(n.val);
  return out;
}

test("206. Reverse Linked List", () => {
  assert.deepEqual(toArray(reverseList(fromArray([1, 2, 3, 4, 5]))), [5, 4, 3, 2, 1]);
  assert.deepEqual(toArray(reverseList(fromArray([1, 2]))), [2, 1]);
  assert.deepEqual(toArray(reverseList(fromArray([]))), []);
  assert.deepEqual(toArray(reverseList(fromArray([7]))), [7]);
});
