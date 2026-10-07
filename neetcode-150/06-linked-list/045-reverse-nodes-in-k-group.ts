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
// @goal is there a node {k} steps past {node ? (node.val === 0 && node.next ? "the node before " + node.next.val : node.val) : "nothing"}?
function getKth(node: ListNode | null, k: number): ListNode | null {
  // @why Stop early if we run out of nodes.
  // @phase Count k nodes ahead
  // @yes {k} {k === 1 ? "step" : "steps"} still to go, and there is a node to step from.
  // @no {node ? "Took every step and landed on " + node.val + "." : "Ran off the end of the list, so fewer than a full group of nodes remain."}
  while (node && k > 0) {
    // @why Take one step.
    // @say Step {node.next ? "to " + node.next.val : "past the end"}.
    node = node.next;
    // @why Count the step.
    k--;
  }
  // @why Return the k-th node, or null if there are fewer than k.
  // @returns {node ? node.val + ": a full group fits, and this is its last node" : "null: fewer nodes remain than a full group needs"}.
  return node;
}

// @rule nodes before groupPrev are final; the group after it is reversed in place
// @why Reverse every full group of `k` nodes; a short group at the end stays as is.
// @goal how do you reverse this list {k} nodes at a time, leaving a short tail alone?
export function reverseKGroup(head: ListNode | null, k: number): ListNode | null {
  // @why A fake node before the head so the first group is handled like any other.
  // @phase Setup: a placeholder before the first group
  // @say Copying values into an array, reversing chunks and rebuilding takes O(n) extra space. Instead reverse each group of {k} in place, like reversing a whole list, then splice it back between the node before it and the node after it. The placeholder gives the first group a "node before" too.
  const dummy = new ListNode(0, head);
  // @why `groupPrev` is the node just before the current group.
  let groupPrev: ListNode = dummy;

  // @why Loop group by group until we run out of nodes.
  // @phase Find the next group of k
  // @yes Look for another full group after {groupPrev === dummy ? "the placeholder" : groupPrev.val}. The loop ends from inside once fewer than {k} nodes are left.
  while (true) {
    // @why Find the last node of this group.
    // @say Check whether {k} more nodes exist after {groupPrev === dummy ? "the placeholder" : groupPrev.val}.
    const kth = getKth(groupPrev, k);
    // @why Fewer than k nodes remain, so leave them alone and stop.
    // @yes Fewer than {k} nodes are left. The problem says a short group stays as it is, so stop.
    // @no The group runs from {groupPrev.next.val} to {kth.val}: {k} nodes, a full group, so reverse it.
    if (!kth) break;
    // @why Remember what comes after the group so we can reconnect.
    // @say Remember {kth.next ? kth.next.val : "the end of the list"}, what follows the group, so it can be reattached.
    const groupNext = kth.next;

    // Reverse the group; its first node will point to groupNext.
    // @why `prev` starts at `groupNext`, so the group's first node ends up linking to the rest.
    // @phase Reverse the group in place
    // @say Start prev at {groupNext ? groupNext.val : "null (the end)"} instead of null: the group's first node will be flipped to point there, so the reversed group stays connected to the rest.
    let prev: ListNode | null = groupNext;
    // @why `cur` starts at the first node of the group.
    let cur: ListNode | null = groupPrev.next;
    // @why Reverse until we step past the group's last node.
    // @yes {cur.val} is still inside the group, so flip it.
    // @no cur reached {groupNext ? groupNext.val : "the end"}, the first node after the group: all {k} arrows are flipped.
    while (cur !== groupNext) {
      // @why Save the next node before changing its link.
      // @say Save {cur.next ? cur.next.val : "the end"} before overwriting {cur.val}'s link.
      const next: ListNode | null = cur!.next;
      // @why Flip this node to point backward.
      // @say Flip {cur.val} to point at {prev ? prev.val : "nothing"}.
      cur!.next = prev; // @ask cur.next?.val
      // @why Grow the reversed part.
      prev = cur;
      // @why Step to the saved next node.
      cur = next;
    }

    // @why The old first node is now the group's last node; save it.
    // @phase Splice the reversed group back in
    // @say {groupPrev.next.val} was the group's first node and is now its last. Save it: it becomes the "node before" for the next group.
    const oldFirst = groupPrev.next!;
    // @why Link the previous group to the new first node (the old k-th).
    // @say Link {groupPrev === dummy ? "the placeholder" : groupPrev.val} to {kth.val}, the group's new first node.
    groupPrev.next = kth; // @ask groupPrev.next.val // @moment group now starts at {kth.val}
    // @why Move `groupPrev` to the end of this group, ready for the next one.
    // @say Move groupPrev onto {oldFirst.val}, the end of this finished group.
    groupPrev = oldFirst;
  }
  // @why Return the real head, which may have changed.
  // @phase Answer
  // @returns {dummy.next ? dummy.next.val : "null"}, the node after the placeholder: the head once every full group is reversed. Each node is counted once and flipped once: O(n) time, O(1) space.
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
