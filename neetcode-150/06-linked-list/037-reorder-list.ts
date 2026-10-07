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
 *
 * Approach: Find middle, reverse second half, interleave
 *   Use slow/fast pointers to find the middle, cut the list there, reverse
 *   the second half, then alternately weave nodes from the two halves.
 *
 * Time: O(n)   Space: O(1)
 *
 * Pattern: linked-list,fast-slow-pointers
 * Key insight: The reordered list alternates the first half with the second half
 *   reversed, so finding the middle (slow/fast), reversing the back half and weaving does
 *   it in O(1) extra space.
 * Real world: A playlist shuffle mode that alternates songs from the start and end of a
 *   queue stored as a linked list.
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

// @rule every back-half node is woven in right after its mirror from the front half
// @why Rearranges the list in place into first, last, second, second-last, and so on.
// @goal how do you reorder this list as first, last, second, second-last, … in place?
export function reorderList(head: ListNode | null): void {
  // @why An empty list needs no work.
  // @phase Setup
  // @yes The list is empty, so there is nothing to reorder.
  // @no Copying the nodes into an array and reading it from both ends takes O(n) extra space. The pattern only needs the back half read backwards, so: find the middle, reverse the back half in place, then weave the two halves together, all in O(1) space.
  // @returns nothing; an empty list is already in order.
  if (!head) return;

  // 1. Find the end of the first half.
  // @why `slow` moves one step at a time to find the middle.
  // @phase Find the middle: fast moves two steps for slow's one
  // @say Counting the length first would take an extra pass. Instead, two pointers: when fast reaches the end, slow, at half fast's speed, is at the middle.
  let slow: ListNode = head;
  // @why `fast` starts one ahead so `slow` stops at the end of the first half.
  let fast: ListNode | null = head.next;
  // @why `fast` moves two steps per round, so when it ends `slow` is at the middle.
  // @yes fast ({fast.val}) can still take two steps, so the middle is further on.
  // @no fast {fast ? "is on the last node" : "ran off the end"}, so slow, at {slow.val}, is the last node of the first half.
  while (fast && fast.next) {
    // @why Slow takes one step.
    // @say slow steps from {slow.val} to {slow.next.val}.
    slow = slow.next!;
    // @why Fast takes two steps.
    // @say fast jumps two ahead, to {fast.next.next ? fast.next.next.val : "past the end"}.
    fast = fast.next.next;
  }

  // 2. Detach and reverse the second half.
  // @why The second half starts right after `slow`.
  // @phase Reverse the back half, so it can be read from its end
  // @say The back half starts at {slow.next ? slow.next.val : "nothing (it is empty)"}.
  let second: ListNode | null = slow.next;
  // @why Cut the list in two so the first half ends cleanly.
  // @say Cut after {slow.val}. Without this the first half would still run into the back half, and the woven list would loop.
  slow.next = null; // @ask second?.val // @moment split after {slow.val}
  // @why `prev` builds the reversed second half.
  let prev: ListNode | null = null;
  // @why Reverse the second half so we can read it from the back.
  // @yes {second.val} still points forward, so flip it.
  // @no The back half is fully reversed{prev ? "; it now starts at " + prev.val + ", the old tail" : ""}.
  while (second) {
    // @why Save the next node before we change its link.
    // @say {second.next ? "Save " + second.next.val + " first: flipping " + second.val + "'s link would otherwise lose the rest." : "Nothing comes after " + second.val + ", but save that too, so the loop knows to stop."}
    const next: ListNode | null = second.next;
    // @why Flip this node to point backward.
    // @say Flip {second.val} to point back at {prev ? prev.val : "nothing (it becomes the reversed half's tail)"}.
    second.next = prev;
    // @why Grow the reversed part.
    prev = second;
    // @why Move on to the saved node.
    // @then Reversed so far starts at {prev.val}; {second ? "next to flip: " + second.val : "nothing left to flip"}.
    second = next;
  }

  // 3. Interleave the two halves.
  // @why `first` walks the front half.
  // @phase Weave: one from the front, one from the back
  // @say first walks the front half from {head.val}.
  let first: ListNode | null = head;
  // @why `second` now starts at the old tail, the head of the reversed half.
  // @say second walks the reversed back half from {prev ? prev.val : "nothing"}, the old tail: exactly the order the back nodes are needed in.
  second = prev;
  // @why Weave until one half runs out (the first half can be longer by one).
  // @yes Front node {first.val} and back node {second.val} are both waiting: put {second.val} right after {first.val}.
  // @no {first ? "The back half is used up; " + first.val + " is the middle node and already ends the list" : "Both halves are used up"}. The list now reads first, last, second, second-last, …, rewired in place in O(n) time and O(1) extra space.
  while (first && second) {
    // @why Save both next nodes before we rewire.
    // @say Save the front half's next node, {first.next ? first.next.val : "none"}, before relinking {first.val}.
    const n1: ListNode | null = first.next;
    // @why Save the next node in the second half.
    // @say Save the back half's next node, {second.next ? second.next.val : "none"}.
    const n2: ListNode | null = second.next;
    // @why Put a back-half node right after the front-half node.
    // @say Link {first.val} → {second.val}: the next node from the back slots in after it.
    first.next = second; // @ask first.next?.val // @moment weave {second.val} after {first.val}
    // @why Then link that node to the rest of the front half.
    // @say {n1 ? "Link " + second.val + " → " + n1.val + ", so the front half carries on after it." : "Point " + second.val + " at nothing: the front half has no more nodes, so " + second.val + " ends the list."}
    second.next = n1;
    // @why Step to the saved front node.
    first = n1;
    // @why Step to the saved back node.
    // @then {first && second ? "Next pair: " + first.val + " and " + second.val + "." : "This was the last pair."}
    second = n2;
  }
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
