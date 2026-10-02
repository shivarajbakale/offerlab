/**
 * 19. Remove Nth Node From End of List
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/remove-nth-node-from-end-of-list/
 *
 * Given the head of a linked list, remove the n-th node counting from the
 * end and return the head of the resulting list.
 *
 * Example 1:
 *   Input: head = [1, 2, 3, 4, 5], n = 2
 *   Output: [1, 2, 3, 5]
 *
 * Example 2:
 *   Input: head = [1], n = 1
 *   Output: []
 *
 * Example 3:
 *   Input: head = [1, 2], n = 1
 *   Output: [1]
 *
 * Constraints:
 *   1 <= sz (number of nodes) <= 30
 *   0 <= Node.val <= 100
 *   1 <= n <= sz
 *
 * Approach: Two pointers with an n-node gap
 *   Start `left` at a dummy node before head and move `right` n nodes ahead
 *   of head. Advance both until `right` falls off the end; `left` then sits
 *   just before the node to delete.
 *
 * Time: O(sz)   Space: O(1)
 *
 * Pattern: linked-list
 * Key insight: If right starts n nodes ahead of left, then when right falls off the end,
 *   left is exactly one node before the nth-from-last, which finds it in one pass without
 *   knowing the length.
 * Real world: Trimming the nth most recent entry from a singly linked event log in a
 *   single pass when the log length is not stored.
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

export function removeNthFromEnd(head: ListNode | null, n: number): ListNode | null {
  const dummy = new ListNode(0, head);
  let left: ListNode = dummy;
  let right = head;
  for (let i = 0; i < n && right; i++) right = right.next;

  while (right) {
    left = left.next!;
    right = right.next;
  }
  left.next = left.next!.next;
  return dummy.next;
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

test("19. Remove Nth Node From End of List", () => {
  const run = (arr: number[], n: number) => toArray(removeNthFromEnd(fromArray(arr), n));
  assert.deepEqual(run([1, 2, 3, 4, 5], 2), [1, 2, 3, 5]);
  assert.deepEqual(run([1], 1), []);
  assert.deepEqual(run([1, 2], 1), [1]);
  assert.deepEqual(run([1, 2, 3], 3), [2, 3]); // remove the head
});
