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

// @rule once the head start is done, right stays n+1 steps ahead of left
// @why Remove the n-th node counted from the end, and return the head.
// @goal how do you remove {n === 1 ? "the last node" : "the node " + n + " places from the end"} of this list in one pass?
export function removeNthFromEnd(head: ListNode | null, n: number): ListNode | null {
  // @why A fake node before the head so removing the head works like any other node.
  // @phase Setup: a placeholder before the head
  // @say Counting the length first, then walking to position length − {n}, takes two passes. Instead, two pointers {n} + 1 nodes apart: when the front one runs off the end, the back one sits just before the node to remove. The placeholder gives the back pointer somewhere to stand if the head itself goes.
  const dummy = new ListNode(0, head);
  // @why `left` will stop right before the node to remove.
  // @say left starts on the placeholder, one step behind the head.
  let left: ListNode = dummy;
  // @why `right` runs ahead of `left`.
  let right = head;
  // @why Give `right` an n-step head start so the gap between the pointers is n.
  // @phase Give right a head start of {n}
  // @yes right has moved {i} of {n} steps, so it takes another.
  // @no {i === n ? "right is " + n + " steps past the head" + (right ? ", at " + right.val : ", just off the end") + ", so it is " + (n + 1) + " ahead of left. Keep that gap and the two land in the right places together." : "right ran off the end early, which only happens if n is larger than the list."}
  // @say right steps {right.next ? "from " + right.val + " to " + right.next.val : "past " + right.val + ", off the end"}.
  for (let i = 0; i < n && right; i++) right = right.next;

  // @why Move both until `right` falls off the end.
  // @phase Slide both pointers until right falls off the end
  // @yes right is on {right.val}, not off the end yet, so slide both pointers one step.
  // @no right fell off the end. left is {n + 1} steps behind, so it sits just before {n === 1 ? "the last node" : "the node " + n + " places from the end"}{left.next ? ", " + left.next.val : ""}.
  while (right) {
    // @why Move `left` forward.
    // @say left steps to {left.next.val}.
    left = left.next!; // @ask left.val
    // @why Move `right` forward, keeping the gap.
    // @say right steps {right.next ? "to " + right.next.val : "past the end"}. The gap stays {n + 1}.
    right = right.next;
  }
  // @why `left` is just before the target, so skip over the target node.
  // @phase Unlink the target
  // @say Remove {left.next.val} by linking {left === dummy ? "the placeholder" : left.val} straight to {left.next.next ? left.next.next.val : "nothing"}. Nothing points at {left.next.val} any more, so it drops out.
  left.next = left.next!.next; // @ask left.next?.val // @moment remove {left.next.val}
  // @why Return from the fake node so a removed head is handled.
  // @returns {dummy.next ? dummy.next.val + ", the node after the placeholder" : "null: the only node was removed"}. Reading from the placeholder covers the case where the old head was the one removed. One pass, O(1) space.
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
