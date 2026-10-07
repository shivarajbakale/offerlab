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

// @rule the list runs least to most recently used and never holds more than capacity
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
    // @phase Setup: an empty usage line between two placeholders
    // @say Keep the keys in a line ordered by last use, oldest next to head and newest next to tail. Eviction then takes from the head end and every use moves a node to the tail end, both O(1).
    this.capacity = capacity;
    // @why Link the two fake nodes so the empty list is valid.
    this.head.next = this.tail;
    // @why Link back from tail to head.
    this.tail.prev = this.head;
  }

  // @why Unlink a node from the list without touching the map.
  // @goal how do you pull key {node.key} out of the usage line in O(1)?
  private remove(node: DNode): void {
    // @why Make the previous node skip over this node.
    // @phase Unlink a node in O(1)
    // @say Key {node.key}'s neighbours link straight to each other. Both links are on the node itself, which is why the list is doubly linked: no walk to find the node before it.
    node.prev!.next = node.next;
    // @why Make the next node point back past this node.
    // @say And the back link: the node after key {node.key} now points back past it. Key {node.key} is out of the line, and the map still holds it.
    node.next!.prev = node.prev;
  }

  /** Insert just before the tail sentinel (most recently used). */
  // @why Put a node at the most recently used end.
  // @goal how do you mark key {node.key} as the most recently used?
  private insert(node: DNode): void {
    // @why Find the node currently last in line.
    // @phase Link a node in at the newest end
    // @say The newest end is just before the tail placeholder. Slot key {node.key} in there.
    const prev = this.tail.prev!;
    // @why Link that node forward to the new node.
    // @say {prev === this.head ? "The line is empty, so the head placeholder" : "Key " + prev.key + ", the current newest,"} links forward to key {node.key}.
    prev.next = node;
    // @why Link the new node back to it.
    // @say Key {node.key} links back to {prev === this.head ? "the head placeholder" : "key " + prev.key}.
    node.prev = prev;
    // @why Link the new node forward to the tail fake node.
    // @say Key {node.key} links forward to the tail placeholder: nothing is newer.
    node.next = this.tail;
    // @why Link the tail back to the new node.
    // @say The tail placeholder points back to key {node.key}: it is now the newest, last in line for eviction.
    this.tail.prev = node;
  }

  // @why Read a value, and count it as just used.
  // @goal what is cached under key {key}, and how do you mark it as just used?
  get(key: number): number {
    // @why Find the node in O(1) using the map.
    // @phase Look up, then move to the newest end
    // @say An array ordered by use would need O(n) to find and move a key. Instead the map finds key {key}'s node in O(1), and the doubly linked list moves it to the newest end in O(1).
    const node = this.map.get(key); // @ask !!node
    // @why Missing key: return -1 as the problem asks.
    // @yes Key {key} isn't cached (never added, or already evicted).
    // @no Key {key} is cached with value {node.val}. Reading it counts as a use, so it moves to the newest end.
    // @returns -1: key {key} is not in the cache.
    if (!node) return -1;
    // @why Take the node out of its old spot.
    // @say Unlink key {key} from where it sits in the usage line.
    this.remove(node);
    // @why Put it at the most recently used end.
    // @say Re-insert it at the newest end, so it will be the last to be evicted.
    this.insert(node);
    // @why Return the cached value.
    // @returns {node.val}, the value for key {key}, now marked most recently used. O(1).
    return node.val;
  }

  // @why Write a value, evicting the oldest item if too many.
  // @goal how do you store {key} = {value} and keep the cache within {this.capacity} items?
  put(key: number, value: number): void {
    // @why Check if the key is already cached.
    // @phase Write the value at the newest end
    // @say A write counts as a use, so key {key} ends up at the newest end whether it is new or not.
    const existing = this.map.get(key);
    // @why Remove the old node; we replace it with a fresh one.
    // @yes Key {key} is already cached (old value {existing.val}), so unlink its old node first, or the list would hold it twice.
    // @no Key {key} is new to the cache.
    if (existing) this.remove(existing);
    // @why Make a new node holding the latest value.
    // @say Make a node for {key} = {value}.
    const node = new DNode(key, value);
    // @why Record it in the map for fast lookup.
    // @say Point the map at the new node, replacing any old entry for {key}.
    this.map.set(key, node); // @ask this.map.size
    // @why Mark it as most recently used.
    // @say Put it at the newest end.
    this.insert(node);

    // @why Over the limit means something must go.
    // @phase Evict if over capacity
    // @yes {this.map.size} items but room for only {this.capacity}, so one must go: the least recently used.
    // @no {this.map.size} of {this.capacity} slots used, so nothing needs evicting.
    if (this.map.size > this.capacity) { // @broken
      // @why The node next to `head` is the least recently used.
      // @say The node right after the head placeholder, key {this.head.next.key}, has gone longest without a get or put.
      const lru = this.head.next!; // @ask lru.key
      // @why Unlink it from the list.
      // @say Unlink key {lru.key} from the list.
      this.remove(lru); // @moment evict key {lru.key}
      // @why Delete it from the map too, so they stay in sync.
      // @say Delete key {lru.key} from the map too, or a later get would find a node that is no longer in the list.
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
