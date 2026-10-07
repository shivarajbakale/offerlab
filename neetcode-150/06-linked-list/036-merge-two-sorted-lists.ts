/**
 * 21. Merge Two Sorted Lists
 * Difficulty: Easy
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/merge-two-sorted-lists/
 *
 * Given the heads of two sorted linked lists, splice their nodes together
 * into one sorted list and return its head.
 *
 * Example 1:
 *   Input: list1 = [1, 2, 4], list2 = [1, 3, 4]
 *   Output: [1, 1, 2, 3, 4, 4]
 *
 * Example 2:
 *   Input: list1 = [], list2 = []
 *   Output: []
 *
 * Example 3:
 *   Input: list1 = [], list2 = [0]
 *   Output: [0]
 *
 * Constraints:
 *   0 <= number of nodes in each list <= 50
 *   -100 <= Node.val <= 100
 *   Both lists are sorted in non-decreasing order.
 *
 * Approach: Dummy head + two pointers
 *   Repeatedly attach the smaller of the two current nodes to the tail of a
 *   dummy-headed result list, then append whatever remains.
 *
 * Time: O(m + n)   Space: O(1)
 *
 * Pattern: linked-list
 * Key insight: A dummy head removes the special case for the first node, and since both
 *   lists are sorted, the smaller current head is always the next node in the result.
 * Real world: The merge step of merge sort and of log-structured databases combining two
 *   sorted runs into one.
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

// @rule dummy..tail is sorted and holds the smallest nodes taken from a and b
// @why Take two sorted lists and return one sorted list made from their nodes.
export function mergeTwoLists(
  list1: ListNode | null,
  list2: ListNode | null,
): ListNode | null {
  // @why A fake first node so we never have to special-case the real head.
  const dummy = new ListNode();
  // @why `tail` is the end of the merged list so far; we always attach here.
  let tail = dummy;
  // @why Walk pointers over both lists without changing the inputs' heads.
  let a = list1;
  let b = list2;
  // @why Compare only while both lists still have nodes.
  while (a && b) {
    // @why Pick the smaller front value so the result stays sorted (`<=` keeps it stable).
    if (a.val <= b.val) {
      // @why Attach the smaller node to the result.
      tail.next = a;
      // @why Advance in the list we just took from.
      a = a.next; // @ask a?.val
    // @why Otherwise `b` has the smaller value.
    } else {
      // @why Attach `b` to the result.
      tail.next = b;
      // @why Advance in list `b`.
      b = b.next;
    }
    // @why Move `tail` to the node we just attached.
    tail = tail.next; // @ask tail.val
  }
  // @why One list is empty; the rest of the other is already sorted, so attach it whole.
  tail.next = a ?? b; // @moment attach the rest from {(a ?? b)?.val}
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

test("21. Merge Two Sorted Lists", () => {
  const merge = (a: number[], b: number[]) =>
    toArray(mergeTwoLists(fromArray(a), fromArray(b)));
  assert.deepEqual(merge([1, 2, 4], [1, 3, 4]), [1, 1, 2, 3, 4, 4]);
  assert.deepEqual(merge([], []), []);
  assert.deepEqual(merge([], [0]), [0]);
  assert.deepEqual(merge([5, 6], [1, 2, 3]), [1, 2, 3, 5, 6]);
});
