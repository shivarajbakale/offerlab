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
 *
 * Pattern: k-way-merge,linked-list
 * Key insight: Merging lists one by one into a growing result re-walks the long result k
 *   times (O(Nk)). Merging in pairs like merge sort means every node takes part in only
 *   log k merges, giving O(N log k).
 * Real world: Log-structured storage engines (LevelDB, Cassandra compaction) and external
 *   sort merge many sorted runs into one sorted output.
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

// @why Merge two sorted lists into one; used as a building block.
function mergeTwo(a: ListNode | null, b: ListNode | null): ListNode | null {
  // @why A fake first node so we never special-case the head.
  const dummy = new ListNode();
  // @why `tail` is where the next node gets attached.
  let tail = dummy;
  // @why Compare only while both lists still have nodes.
  while (a && b) {
    // @why Take the smaller front value to stay sorted.
    if (a.val <= b.val) {
      // @why Attach the smaller node.
      tail.next = a;
      // @why Advance in that list.
      a = a.next;
    // @why Otherwise `b` is smaller.
    } else {
      // @why Attach `b`'s node.
      tail.next = b;
      // @why Advance in `b`.
      b = b.next;
    }
    // @why Move `tail` to the node just attached.
    tail = tail.next;
  }
  // @why One list ran out; attach the other's remainder whole.
  tail.next = a ?? b;
  // @why Return the real head, past the fake node.
  return dummy.next;
}

// @why Merge k sorted lists into one sorted list.
export function mergeKLists(lists: Array<ListNode | null>): ListNode | null {
  // @why No lists means nothing to merge.
  if (lists.length === 0) return null;
  // @why The lists still waiting to be merged.
  let current = lists;
  // @why Keep merging in pairs until a single list is left.
  while (current.length > 1) {
    // @why Holds the results of this round of pair merges.
    const merged: Array<ListNode | null> = [];
    // @why Take lists two at a time; pairing keeps the work at O(n log k).
    for (let i = 0; i < current.length; i += 2) {
      // @why Merge a pair; with an odd count the last one pairs with null.
      merged.push(mergeTwo(current[i], i + 1 < current.length ? current[i + 1] : null));
    }
    // @why The merged lists become the next round's input.
    current = merged;
  }
  // @why Only one list remains: the answer.
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
