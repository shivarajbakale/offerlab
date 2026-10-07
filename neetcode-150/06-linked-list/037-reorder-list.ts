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
export function reorderList(head: ListNode | null): void {
  // @why An empty list needs no work.
  if (!head) return;

  // 1. Find the end of the first half.
  // @why `slow` moves one step at a time to find the middle.
  let slow: ListNode = head;
  // @why `fast` starts one ahead so `slow` stops at the end of the first half.
  let fast: ListNode | null = head.next;
  // @why `fast` moves two steps per round, so when it ends `slow` is at the middle.
  while (fast && fast.next) {
    // @why Slow takes one step.
    slow = slow.next!;
    // @why Fast takes two steps.
    fast = fast.next.next;
  }

  // 2. Detach and reverse the second half.
  // @why The second half starts right after `slow`.
  let second: ListNode | null = slow.next;
  // @why Cut the list in two so the first half ends cleanly.
  slow.next = null; // @ask second?.val // @moment split after {slow.val}
  // @why `prev` builds the reversed second half.
  let prev: ListNode | null = null;
  // @why Reverse the second half so we can read it from the back.
  while (second) {
    // @why Save the next node before we change its link.
    const next: ListNode | null = second.next;
    // @why Flip this node to point backward.
    second.next = prev;
    // @why Grow the reversed part.
    prev = second;
    // @why Move on to the saved node.
    second = next;
  }

  // 3. Interleave the two halves.
  // @why `first` walks the front half.
  let first: ListNode | null = head;
  // @why `second` now starts at the old tail, the head of the reversed half.
  second = prev;
  // @why Weave until one half runs out (the first half can be longer by one).
  while (first && second) {
    // @why Save both next nodes before we rewire.
    const n1: ListNode | null = first.next;
    // @why Save the next node in the second half.
    const n2: ListNode | null = second.next;
    // @why Put a back-half node right after the front-half node.
    first.next = second; // @ask first.next?.val // @moment weave {second.val} after {first.val}
    // @why Then link that node to the rest of the front half.
    second.next = n1;
    // @why Step to the saved front node.
    first = n1;
    // @why Step to the saved back node.
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
