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
// @goal what is the sum of these two reversed-digit numbers, as a list?
export function addTwoNumbers(l1: ListNode | null, l2: ListNode | null): ListNode | null {
  // @why A fake first node so the result list is easy to start.
  // @phase Setup: an empty result and no carry
  // @say Converting both lists to numbers and adding overflows once they pass about 15 digits. The digits are stored ones-first, the same order you add by hand, so add column by column and carry, with no size limit.
  const dummy = new ListNode();
  // @why `tail` is where the next digit node is attached.
  let tail = dummy;
  // @why `carry` is the extra 1 that moves to the next digit (0 or 1).
  let carry = 0;
  // @why Keep going while any digit or a leftover carry remains.
  // @phase Add one column per step, ones first
  // @yes {l1 || l2 ? "Column digits remain" : "Both numbers are used up, but a carry of " + carry + " is left over and needs its own digit"}, so add another column.
  // @no Both numbers are used up and the carry is 0, so every column is written.
  while (l1 || l2 || carry) {
    // @why Add the two digits (a missing list counts as 0) plus the carry.
    // @say {l1 ? l1.val : "0 (number 1 has no digit here)"} + {l2 ? l2.val : "0 (number 2 has no digit here)"} + carry {carry} = {(l1 ? l1.val : 0) + (l2 ? l2.val : 0) + carry}.
    const sum = (l1?.val ?? 0) + (l2?.val ?? 0) + carry; // @ask sum
    // @why The carry for the next column is the tens part of the sum.
    // @say {sum >= 10 ? sum + " doesn't fit in one digit, so carry 1 into the next column." : sum + " fits in one digit, so nothing carries."}
    carry = Math.floor(sum / 10); // @ask carry
    // @why The digit to keep in this column is the ones part.
    // @say Write {sum % 10}, the ones part of {sum}, as this column's digit.
    tail.next = new ListNode(sum % 10); // @moment write digit {sum % 10}
    // @why Move `tail` to the new node.
    tail = tail.next;
    // @why Step `l1` forward, or stay at null if it ended.
    // @say Number 1 moves to its next digit{l1 && l1.next ? ", " + l1.next.val : " (none left, so it counts as 0 from here)"}.
    l1 = l1?.next ?? null;
    // @why Step `l2` forward, or stay at null if it ended.
    // @say Number 2 moves to its next digit{l2 && l2.next ? ", " + l2.next.val : " (none left, so it counts as 0 from here)"}.
    l2 = l2?.next ?? null;
  }
  // @why Skip the fake node and return the real head.
  // @phase Answer
  // @returns the sum's ones digit, {dummy.next.val}, heading the list, still ones-first. One pass over the longer number: O(max(m, n)).
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
