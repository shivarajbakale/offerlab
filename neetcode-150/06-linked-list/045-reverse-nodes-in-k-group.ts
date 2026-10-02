/**
 * 25. Reverse Nodes in k-Group
 * Difficulty: Hard
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/reverse-nodes-in-k-group/
 *
 * Given the head of a linked list and a positive integer k, reverse the
 * nodes k at a time and return the modified list. If the number of nodes
 * left at the end is less than k, leave them in their original order. Only
 * links may change, not node values.
 *
 * Example 1:
 *   Input: head = [1, 2, 3, 4, 5], k = 2
 *   Output: [2, 1, 4, 3, 5]
 *
 * Example 2:
 *   Input: head = [1, 2, 3, 4, 5], k = 3
 *   Output: [3, 2, 1, 4, 5]
 *
 * Constraints:
 *   1 <= k <= n <= 5000
 *   0 <= Node.val <= 1000
 *
 * Approach: Iterative group reversal with a dummy head
 *   `groupPrev` is the node before the current group. Walk k steps to find
 *   the group's k-th node; if fewer than k remain, stop. Reverse the group
 *   in place (seeding prev with the node after the group so the reversed
 *   tail reconnects), then stitch groupPrev to the new group head and move
 *   groupPrev to the old group head (now its tail).
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

function getKth(node: ListNode | null, k: number): ListNode | null {
  while (node && k > 0) {
    node = node.next;
    k--;
  }
  return node;
}

export function reverseKGroup(head: ListNode | null, k: number): ListNode | null {
  const dummy = new ListNode(0, head);
  let groupPrev: ListNode = dummy;

  while (true) {
    const kth = getKth(groupPrev, k);
    if (!kth) break;
    const groupNext = kth.next;

    // Reverse the group; its first node will point to groupNext.
    let prev: ListNode | null = groupNext;
    let cur: ListNode | null = groupPrev.next;
    while (cur !== groupNext) {
      const next: ListNode | null = cur!.next;
      cur!.next = prev;
      prev = cur;
      cur = next;
    }

    const oldFirst = groupPrev.next!;
    groupPrev.next = kth;
    groupPrev = oldFirst;
  }
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

test("25. Reverse Nodes in k-Group", () => {
  const run = (arr: number[], k: number) => toArray(reverseKGroup(fromArray(arr), k));
  assert.deepEqual(run([1, 2, 3, 4, 5], 2), [2, 1, 4, 3, 5]);
  assert.deepEqual(run([1, 2, 3, 4, 5], 3), [3, 2, 1, 4, 5]);
  assert.deepEqual(run([1, 2, 3], 1), [1, 2, 3]);
  assert.deepEqual(run([1, 2, 3, 4], 4), [4, 3, 2, 1]);
});
