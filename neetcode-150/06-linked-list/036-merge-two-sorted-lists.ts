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
// @goal how do you splice two sorted lists into one sorted list without making new nodes?
export function mergeTwoLists(
  list1: ListNode | null,
  list2: ListNode | null,
): ListNode | null {
  // @why A fake first node so we never have to special-case the real head.
  // @phase Setup: a placeholder head and a tail to build on
  // @say Copying both lists into an array and sorting costs O((m+n) log(m+n)) time and extra space. Both lists are already sorted, so the smallest remaining node is always at the front of one of them: compare two fronts, take the smaller, and relink in place.
  const dummy = new ListNode();
  // @why `tail` is the end of the merged list so far; we always attach here.
  // @say tail marks where the next node goes. It starts on the placeholder, so the first real node needs no special case.
  let tail = dummy;
  // @why Walk pointers over both lists without changing the inputs' heads.
  // @say a and b mark the smallest node not yet taken from each list: {list1 ? list1.val : "nothing (list 1 is empty)"} and {list2 ? list2.val : "nothing (list 2 is empty)"}.
  let a = list1;
  let b = list2;
  // @why Compare only while both lists still have nodes.
  // @phase Take the smaller front node, one at a time
  // @yes Both lists still have nodes ({a.val} and {b.val} at the fronts), so the next node must be one of these two.
  // @no {a ? "List 2 is used up" : b ? "List 1 is used up" : "Both lists are used up"}, so there is nothing left to compare.
  while (a && b) {
    // @why Pick the smaller front value so the result stays sorted (`<=` keeps it stable).
    // @yes {a.val} ≤ {b.val}: every node behind either front is at least as big, so {a.val} is the smallest node left. Take it from list 1.
    // @no {b.val} < {a.val}: {b.val} is the smallest node left in either list. Take it from list 2.
    if (a.val <= b.val) {
      // @why Attach the smaller node to the result.
      // @say Link {a.val} onto the end of the merged list{tail === dummy ? " (it becomes the head)" : ", after " + tail.val}.
      tail.next = a;
      // @why Advance in the list we just took from.
      // @say List 1's front moves on to {a.next ? a.next.val : "nothing: list 1 is used up"}.
      a = a.next; // @ask a?.val
    // @why Otherwise `b` has the smaller value.
    } else {
      // @why Attach `b` to the result.
      // @say Link {b.val} onto the end of the merged list{tail === dummy ? " (it becomes the head)" : ", after " + tail.val}.
      tail.next = b;
      // @why Advance in list `b`.
      // @say List 2's front moves on to {b.next ? b.next.val : "nothing: list 2 is used up"}.
      b = b.next;
    }
    // @why Move `tail` to the node we just attached.
    // @say Move tail onto {tail.next.val}, the node just attached, so the next pick links after it.
    tail = tail.next; // @ask tail.val
  }
  // @why One list is empty; the rest of the other is already sorted, so attach it whole.
  // @phase Attach the leftover in one link
  // @say {a ?? b ? "The rest, from " + (a ?? b).val + " on, is already sorted and every node in it is ≥ " + tail.val + ", so link it on whole instead of one node at a time." : "Both lists ran out together, so nothing is left to attach."}
  tail.next = a ?? b; // @moment attach the rest from {(a ?? b)?.val}
  // @why Skip the fake node and return the real head.
  // @returns {dummy.next ? "the node after the placeholder, " + dummy.next.val + ": the merged list's real head. Each node was linked once, O(m + n) time and O(1) extra space." : "null: both lists were empty, so the merged list is empty too."}
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
