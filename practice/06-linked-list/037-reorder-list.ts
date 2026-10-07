/**
 * 143. Reorder List
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/reorder-list/
 *
 * Given the head of a singly linked list L0 -> L1 -> ... -> Ln-1 -> Ln,
 * reorder it in place to L0 -> Ln -> L1 -> Ln-1 -> L2 -> Ln-2 -> ...
 * Only node links may change, not node values.
 *
 * Example 1:
 *   Input: head = [1, 2, 3, 4]
 *   Output: [1, 4, 2, 3]
 *
 * Example 2:
 *   Input: head = [1, 2, 3, 4, 5]
 *   Output: [1, 5, 2, 4, 3]
 *
 * Constraints:
 *   1 <= number of nodes <= 5 * 10^4
 *   1 <= Node.val <= 1000
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

export function reorderList(head: ListNode | null): void {
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

test("143. Reorder List", () => {
  const run = (arr: number[]) => {
    const head = fromArray(arr);
    reorderList(head);
    return toArray(head);
  };
  assert.deepEqual(run([1, 2, 3, 4]), [1, 4, 2, 3]);
  assert.deepEqual(run([1, 2, 3, 4, 5]), [1, 5, 2, 4, 3]);
  assert.deepEqual(run([1]), [1]);
  assert.deepEqual(run([1, 2]), [1, 2]);
});
