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
 *
 * Pattern: linked-list
 * Key insight: Digits are stored least significant first, which is exactly the order
 *   grade-school addition needs, so no reversal is required. Looping while either list or
 *   the carry is non-empty handles unequal lengths and a final carry in one rule.
 * Real world: Arbitrary-precision integer libraries (BigInt, GMP) add numbers stored as
 *   arrays of limbs, least significant first, carrying between limbs the same way.
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

// @rule dummy..tail holds the sum's low digits so far; carry spills into the next column
// @why Digits are stored in reverse, so we add from the front, like adding by hand.
export function addTwoNumbers(l1: ListNode | null, l2: ListNode | null): ListNode | null {
  // @why A fake first node so the result list is easy to start.
  const dummy = new ListNode();
  // @why `tail` is where the next digit node is attached.
  let tail = dummy;
  // @why `carry` is the extra 1 that moves to the next digit (0 or 1).
  let carry = 0;
  // @why Keep going while any digit or a leftover carry remains.
  while (l1 || l2 || carry) {
    // @why Add the two digits (a missing list counts as 0) plus the carry.
    const sum = (l1?.val ?? 0) + (l2?.val ?? 0) + carry; // @ask sum
    // @why The carry for the next column is the tens part of the sum.
    carry = Math.floor(sum / 10); // @ask carry
    // @why The digit to keep in this column is the ones part.
    tail.next = new ListNode(sum % 10); // @moment write digit {sum % 10}
    // @why Move `tail` to the new node.
    tail = tail.next;
    // @why Step `l1` forward, or stay at null if it ended.
    l1 = l1?.next ?? null;
    // @why Step `l2` forward, or stay at null if it ended.
    l2 = l2?.next ?? null;
  }
  // @why Skip the fake node and return the real head.
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
