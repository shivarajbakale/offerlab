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

export function reverseKGroup(head: ListNode | null, k: number): ListNode | null {
  // TODO: implement
  throw new Error("Not implemented");
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
