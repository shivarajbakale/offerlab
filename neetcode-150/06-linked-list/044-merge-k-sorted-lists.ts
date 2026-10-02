/**
 * 23. Merge k Sorted Lists
 * Difficulty: Hard
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/merge-k-sorted-lists/
 *
 * You are given an array of k linked lists, each sorted ascending. Merge
 * them all into one sorted linked list and return its head.
 *
 * Example 1:
 *   Input: lists = [[1,4,5],[1,3,4],[2,6]]
 *   Output: [1,1,2,3,4,4,5,6]
 *
 * Example 2:
 *   Input: lists = []
 *   Output: []
 *
 * Example 3:
 *   Input: lists = [[]]
 *   Output: []
 *
 * Constraints:
 *   0 <= k <= 10^4
 *   0 <= lists[i].length <= 500
 *   -10^4 <= lists[i][j] <= 10^4
 *   Total number of nodes <= 10^4
 *
 * Approach: Divide and conquer (pairwise merging)
 *   Merge lists in pairs each round: (0,1), (2,3), ... halving the number
 *   of lists until one remains. Each round touches every node once and
 *   there are log k rounds.
 *
 * Time: O(N log k), N = total nodes   Space: O(k) for the per-round array
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

function mergeTwo(a: ListNode | null, b: ListNode | null): ListNode | null {
  const dummy = new ListNode();
  let tail = dummy;
  while (a && b) {
    if (a.val <= b.val) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a ?? b;
  return dummy.next;
}

export function mergeKLists(lists: Array<ListNode | null>): ListNode | null {
  if (lists.length === 0) return null;
  let current = lists;
  while (current.length > 1) {
    const merged: Array<ListNode | null> = [];
    for (let i = 0; i < current.length; i += 2) {
      merged.push(mergeTwo(current[i], i + 1 < current.length ? current[i + 1] : null));
    }
    current = merged;
  }
  return current[0];
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

test("23. Merge k Sorted Lists", () => {
  const run = (arrs: number[][]) => toArray(mergeKLists(arrs.map(fromArray)));
  assert.deepEqual(run([[1, 4, 5], [1, 3, 4], [2, 6]]), [1, 1, 2, 3, 4, 4, 5, 6]);
  assert.deepEqual(run([]), []);
  assert.deepEqual(run([[]]), []);
  assert.deepEqual(run([[], [-1, 5], [], [0]]), [-1, 0, 5]);
});
