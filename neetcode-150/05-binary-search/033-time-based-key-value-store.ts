/**
 * 981. Time Based Key-Value Store
 * Difficulty: Medium
 * Category: Binary Search
 * LeetCode: https://leetcode.com/problems/time-based-key-value-store/
 *
 * Design a key-value store that keeps multiple values per key at different
 * timestamps and can return the value as of a given time:
 *   - set(key, value, timestamp): store `value` for `key` at `timestamp`.
 *   - get(key, timestamp): return the value set for `key` with the largest
 *     timestamp_prev <= timestamp, or "" if there is none.
 *
 * Example 1:
 *   Input:  set("foo","bar",1), get("foo",1), get("foo",3),
 *           set("foo","bar2",4), get("foo",4), get("foo",5)
 *   Output: "bar", "bar", "bar2", "bar2"
 *
 * Constraints:
 *   1 <= key.length, value.length <= 100
 *   1 <= timestamp <= 10^7
 *   Timestamps passed to set are strictly increasing.
 *   At most 2 * 10^5 calls to set and get.
 *
 * Approach: Hash map of time-sorted lists + binary search
 *   Because set timestamps arrive in increasing order, each key's list is
 *   already sorted. get binary searches for the rightmost timestamp that is
 *   <= the query.
 *
 * Time: set O(1), get O(log n)   Space: O(n)
 *
 * Pattern: binary-search,design
 * Key insight: Timestamps for a key arrive in increasing order, so appending keeps each
 *   list sorted for free, and get becomes a binary search for the last timestamp <= the
 *   query.
 * Real world: Versioned config stores and MVCC databases answer "what was the value at
 *   time t?" by searching a key's sorted version history.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class TimeMap {
  private store: Map<string, Array<[number, string]>>;

  constructor() {
    this.store = new Map();
  }

  set(key: string, value: string, timestamp: number): void {
    let list = this.store.get(key);
    if (!list) {
      list = [];
      this.store.set(key, list);
    }
    list.push([timestamp, value]);
  }

  get(key: string, timestamp: number): string {
    const list = this.store.get(key);
    if (!list) return "";
    let lo = 0;
    let hi = list.length - 1;
    let res = "";
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid][0] <= timestamp) {
        res = list[mid][1];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return res;
  }
}

test("981. Time Based Key-Value Store", () => {
  const tm = new TimeMap();
  tm.set("foo", "bar", 1);
  assert.equal(tm.get("foo", 1), "bar");
  assert.equal(tm.get("foo", 3), "bar");
  tm.set("foo", "bar2", 4);
  assert.equal(tm.get("foo", 4), "bar2");
  assert.equal(tm.get("foo", 5), "bar2");

  // Edge cases: query before first timestamp, missing key.
  assert.equal(tm.get("foo", 0), "");
  assert.equal(tm.get("missing", 10), "");
});
