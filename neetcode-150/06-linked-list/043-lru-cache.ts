/**
 * 146. LRU Cache
 * Difficulty: Medium
 * Category: Linked List
 * LeetCode: https://leetcode.com/problems/lru-cache/
 *
 * Design a Least Recently Used cache with a fixed positive capacity:
 *   - get(key): return the key's value if present (marking it most recently
 *     used), otherwise -1.
 *   - put(key, value): insert or update the key (marking it most recently
 *     used). If this pushes the size over capacity, evict the least
 *     recently used key.
 * Both operations must run in O(1) average time.
 *
 * Example 1:
 *   Input:  LRUCache(2), put(1,1), put(2,2), get(1), put(3,3), get(2),
 *           put(4,4), get(1), get(3), get(4)
 *   Output: get(1)=1, get(2)=-1, get(1)=-1, get(3)=3, get(4)=4
 *
 * Constraints:
 *   1 <= capacity <= 3000
 *   0 <= key <= 10^4
 *   0 <= value <= 10^5
 *   At most 2 * 10^5 calls to get and put.
 *
 * Approach: Hash map + doubly linked list
 *   The map gives O(1) key -> node lookup. A doubly linked list between two
 *   sentinels keeps recency order: the node right after `head` is least
 *   recent (LRU), the node right before `tail` is most recent. Any access
 *   unlinks the node and reinserts it before `tail`; eviction removes the
 *   node after `head`.
 *
 * Time: O(1) per operation   Space: O(capacity)
 *
 * Pattern: design,linked-list
 * Key insight: A map alone finds keys in O(1) but cannot say which is oldest; a list
 *   alone keeps order but cannot find keys. Storing list nodes in the map lets every get
 *   or put unlink and relink a node in O(1), and the sentinels remove all head/tail edge
 *   cases.
 * Real world: Memcached, Redis allkeys-lru and the OS page cache evict the least recently
 *   used entry when memory is full, keeping recency order alongside the key index.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A doubly linked node, so we can remove it from the middle in O(1).
class DNode {
  // @why The key is stored so we can delete it from the map when evicting.
  key: number;
  // @why The cached value.
  val: number;
  // @why Link to the node before this one (less recently used side).
  prev: DNode | null = null;
  // @why Link to the node after this one (more recently used side).
  next: DNode | null = null;
  // @why Create a node with a key and value.
  constructor(key: number, val: number) {
    this.key = key;
    this.val = val;
  }
}

// @why A cache that drops the least recently used item when full.
export class LRUCache {
  // @why The most items the cache may hold.
  private capacity: number;
  // @why Map from key to node, for instant lookup.
  private map = new Map<number, DNode>();
  // @why Fake node at the least recently used end, so the real first node is `head.next`.
  private head = new DNode(0, 0); // sentinel on the LRU side
  // @why Fake node at the most recently used end; new items go just before it.
  private tail = new DNode(0, 0); // sentinel on the MRU side

  // @why Create the cache with a size limit.
  constructor(capacity: number) {
    // @why Remember the limit.
    this.capacity = capacity;
    // @why Link the two fake nodes so the empty list is valid.
    this.head.next = this.tail;
    // @why Link back from tail to head.
    this.tail.prev = this.head;
  }

  // @why Unlink a node from the list without touching the map.
  private remove(node: DNode): void {
    // @why Make the previous node skip over this node.
    node.prev!.next = node.next;
    // @why Make the next node point back past this node.
    node.next!.prev = node.prev;
  }

  /** Insert just before the tail sentinel (most recently used). */
  // @why Put a node at the most recently used end.
  private insert(node: DNode): void {
    // @why Find the node currently last in line.
    const prev = this.tail.prev!;
    // @why Link that node forward to the new node.
    prev.next = node;
    // @why Link the new node back to it.
    node.prev = prev;
    // @why Link the new node forward to the tail fake node.
    node.next = this.tail;
    // @why Link the tail back to the new node.
    this.tail.prev = node;
  }

  // @why Read a value, and count it as just used.
  get(key: number): number {
    // @why Find the node in O(1) using the map.
    const node = this.map.get(key);
    // @why Missing key: return -1 as the problem asks.
    if (!node) return -1;
    // @why Take the node out of its old spot.
    this.remove(node);
    // @why Put it at the most recently used end.
    this.insert(node);
    // @why Return the cached value.
    return node.val;
  }

  // @why Write a value, evicting the oldest item if too many.
  put(key: number, value: number): void {
    // @why Check if the key is already cached.
    const existing = this.map.get(key);
    // @why Remove the old node; we replace it with a fresh one.
    if (existing) this.remove(existing);
    // @why Make a new node holding the latest value.
    const node = new DNode(key, value);
    // @why Record it in the map for fast lookup.
    this.map.set(key, node);
    // @why Mark it as most recently used.
    this.insert(node);

    // @why Over the limit means something must go.
    if (this.map.size > this.capacity) {
      // @why The node next to `head` is the least recently used.
      const lru = this.head.next!;
      // @why Unlink it from the list.
      this.remove(lru);
      // @why Delete it from the map too, so they stay in sync.
      this.map.delete(lru.key);
    }
  }
}

test("146. LRU Cache", () => {
  const c = new LRUCache(2);
  c.put(1, 1);
  c.put(2, 2);
  assert.equal(c.get(1), 1);
  c.put(3, 3); // evicts 2
  assert.equal(c.get(2), -1);
  c.put(4, 4); // evicts 1
  assert.equal(c.get(1), -1);
  assert.equal(c.get(3), 3);
  assert.equal(c.get(4), 4);

  // Updating an existing key refreshes it and does not evict.
  const d = new LRUCache(2);
  d.put(1, 1);
  d.put(2, 2);
  d.put(1, 10);
  d.put(3, 3); // evicts 2, not 1
  assert.equal(d.get(1), 10);
  assert.equal(d.get(2), -1);

  // Capacity 1.
  const e = new LRUCache(1);
  e.put(2, 1);
  assert.equal(e.get(2), 1);
  e.put(3, 2);
  assert.equal(e.get(2), -1);
  assert.equal(e.get(3), 2);
});
