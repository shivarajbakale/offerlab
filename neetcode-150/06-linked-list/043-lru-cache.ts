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

class DNode {
  key: number;
  val: number;
  prev: DNode | null = null;
  next: DNode | null = null;
  constructor(key: number, val: number) {
    this.key = key;
    this.val = val;
  }
}

export class LRUCache {
  private capacity: number;
  private map = new Map<number, DNode>();
  private head = new DNode(0, 0); // sentinel on the LRU side
  private tail = new DNode(0, 0); // sentinel on the MRU side

  constructor(capacity: number) {
    this.capacity = capacity;
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  private remove(node: DNode): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  /** Insert just before the tail sentinel (most recently used). */
  private insert(node: DNode): void {
    const prev = this.tail.prev!;
    prev.next = node;
    node.prev = prev;
    node.next = this.tail;
    this.tail.prev = node;
  }

  get(key: number): number {
    const node = this.map.get(key);
    if (!node) return -1;
    this.remove(node);
    this.insert(node);
    return node.val;
  }

  put(key: number, value: number): void {
    const existing = this.map.get(key);
    if (existing) this.remove(existing);
    const node = new DNode(key, value);
    this.map.set(key, node);
    this.insert(node);

    if (this.map.size > this.capacity) {
      const lru = this.head.next!;
      this.remove(lru);
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
