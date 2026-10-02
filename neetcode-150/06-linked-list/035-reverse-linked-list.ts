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

export function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  let cur = head;
  while (cur) {
    const next: ListNode | null = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
  }
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
