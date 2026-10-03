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
 *
 * Pattern: linked-list
 * Key insight: Check that k nodes remain before touching anything, so a short tail is
 *   left as is. Starting the reversal with prev = the node after the group makes the
 *   reversed group's tail already point at the rest of the list, so only groupPrev.next
 *   needs fixing.
 * Real world: Reordering fixed-size blocks in place inside a buffer chain, such as a
 *   network stack reversing byte order per k-byte word in a list of packet buffers.
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

// @why Walk forward `k` steps from `node` and return where we land (null if the list is too short).
function getKth(node: ListNode | null, k: number): ListNode | null {
  // @why Stop early if we run out of nodes.
  while (node && k > 0) {
    // @why Take one step.
    node = node.next;
    // @why Count the step.
    k--;
  }
  // @why Return the k-th node, or null if there are fewer than k.
  return node;
}

// @why Reverse every full group of `k` nodes; a short group at the end stays as is.
export function reverseKGroup(head: ListNode | null, k: number): ListNode | null {
  // @why A fake node before the head so the first group is handled like any other.
  const dummy = new ListNode(0, head);
  // @why `groupPrev` is the node just before the current group.
  let groupPrev: ListNode = dummy;

  // @why Loop group by group until we run out of nodes.
  while (true) {
    // @why Find the last node of this group.
    const kth = getKth(groupPrev, k);
    // @why Fewer than k nodes remain, so leave them alone and stop.
    if (!kth) break;
    // @why Remember what comes after the group so we can reconnect.
    const groupNext = kth.next;

    // Reverse the group; its first node will point to groupNext.
    // @why `prev` starts at `groupNext`, so the group's first node ends up linking to the rest.
    let prev: ListNode | null = groupNext;
    // @why `cur` starts at the first node of the group.
    let cur: ListNode | null = groupPrev.next;
    // @why Reverse until we step past the group's last node.
    while (cur !== groupNext) {
      // @why Save the next node before changing its link.
      const next: ListNode | null = cur!.next;
      // @why Flip this node to point backward.
      cur!.next = prev;
      // @why Grow the reversed part.
      prev = cur;
      // @why Step to the saved next node.
      cur = next;
    }

    // @why The old first node is now the group's last node; save it.
    const oldFirst = groupPrev.next!;
    // @why Link the previous group to the new first node (the old k-th).
    groupPrev.next = kth;
    // @why Move `groupPrev` to the end of this group, ready for the next one.
    groupPrev = oldFirst;
  }
  // @why Return the real head, which may have changed.
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
