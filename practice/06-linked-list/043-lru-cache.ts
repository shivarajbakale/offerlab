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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class LRUCache {
  constructor(capacity: number) {
    // TODO: set up your data structures
  }

  get(key: number): number {
    // TODO: implement
    throw new Error("Not implemented");
  }

  put(key: number, value: number): void {
    // TODO: implement
    throw new Error("Not implemented");
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
