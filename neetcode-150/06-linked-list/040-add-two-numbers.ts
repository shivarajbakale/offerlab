/**
 * 2. Add Two Numbers
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/add-two-numbers/
 *
 * Two non-empty linked lists represent non-negative integers with digits
 * stored in reverse order (least significant first), one digit per node.
 * Return their sum as a linked list in the same format. Neither number has
 * leading zeros except the number 0 itself.
 *
 * Example 1:
 *   Input: l1 = [2, 4, 3], l2 = [5, 6, 4]
 *   Output: [7, 0, 8]   (342 + 465 = 807)
 *
 * Example 2:
 *   Input: l1 = [0], l2 = [0]
 *   Output: [0]
 *
 * Example 3:
 *   Input: l1 = [9,9,9,9,9,9,9], l2 = [9,9,9,9]
 *   Output: [8,9,9,9,0,0,0,1]
 *
 * Constraints:
 *   1 <= number of nodes in each list <= 100
 *   0 <= Node.val <= 9
 *
 * Approach: Grade-school addition with carry
 *   Walk both lists together, summing digits plus carry; emit sum % 10 and
 *   carry floor(sum / 10). Keep going while either list or a carry remains.
 *
 * Time: O(max(m, n))   Space: O(1) extra (output list aside)
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

export function addTwoNumbers(l1: ListNode | null, l2: ListNode | null): ListNode | null {
  const dummy = new ListNode();
  let tail = dummy;
  let carry = 0;
  while (l1 || l2 || carry) {
    const sum = (l1?.val ?? 0) + (l2?.val ?? 0) + carry;
    carry = Math.floor(sum / 10);
    tail.next = new ListNode(sum % 10);
    tail = tail.next;
    l1 = l1?.next ?? null;
    l2 = l2?.next ?? null;
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

test("2. Add Two Numbers", () => {
  const add = (a: number[], b: number[]) => toArray(addTwoNumbers(fromArray(a), fromArray(b)));
  assert.deepEqual(add([2, 4, 3], [5, 6, 4]), [7, 0, 8]);
  assert.deepEqual(add([0], [0]), [0]);
  assert.deepEqual(add([9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9]), [8, 9, 9, 9, 0, 0, 0, 1]);
  assert.deepEqual(add([5], [5]), [0, 1]); // final carry creates a node
});
