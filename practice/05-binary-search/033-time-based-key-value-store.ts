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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class TimeMap {
  constructor() {
    // TODO: set up your data structures
  }

  set(key: string, value: string, timestamp: number): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  get(key: string, timestamp: number): string {
    // TODO: implement
    throw new Error("Not implemented");
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
