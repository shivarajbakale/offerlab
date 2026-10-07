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

// @viz range:lo..hi@mid
// @rule res is the newest entry left of lo; every entry right of hi is too new
// @why Stores values per key with timestamps and answers 'latest value at or before this time'.
export class TimeMap {
  // @why For each key, a list of [timestamp, value] pairs.
  private store: Map<string, Array<[number, string]>>;

  // @why Set up the empty store.
  constructor() {
    // @why Start with no keys.
    this.store = new Map();
  }

  // @why Save a value for a key at a timestamp.
  // @goal how do you record "{key}" = "{value}" at time {timestamp} so later lookups stay fast?
  set(key: string, value: string, timestamp: number): void {
    // @why Find this key's list, if it has one.
    // @phase Append to this key's history
    // @say Each key keeps its own history of [time, value] pairs. Rewriting one map entry per timestamp would lose the old values that past-time lookups still need.
    let list = this.store.get(key);
    // @why First time we see this key.
    // @yes "{key}" has no history yet, so give it an empty one.
    // @no "{key}" already has {list.length} {list.length === 1 ? "entry" : "entries"}, so just add to the end.
    if (!list) {
      // @why Make a new empty list for it.
      list = [];
      // @why Attach it to the key so later calls find it.
      this.store.set(key, list);
    }
    // @why Timestamps only go up, so adding at the end keeps the list sorted for binary search.
    // @say Timestamps arrive in increasing order, so appending {timestamp} keeps the history sorted for free: no insertion search, and get can binary search it. "{key}" will hold {list.length + 1} {list.length === 0 ? "entry" : "entries"}, oldest first.
    list.push([timestamp, value]);
  }

  // @why Find the value with the biggest timestamp that is not above `timestamp`.
  // @goal what was "{key}" set to at time {timestamp}?
  get(key: string, timestamp: number): string {
    // @why Get this key's list.
    // @phase Find this key's sorted history
    // @say Scanning the history backwards is O(n) per lookup. The history is sorted by time, so binary search for the last entry at or before {timestamp}.
    const list = this.store.get(key);
    // @why Unknown key has no value, so return an empty string.
    // @yes "{key}" was never set, so it had no value at any time.
    // @no "{key}" has {list.length} {list.length === 1 ? "entry" : "entries"} to search.
    // @returns "" because "{key}" was never set.
    if (!list) return "";
    // @why `lo` and `hi` bound the search over the sorted list.
    // @phase Binary search for the newest entry not after {timestamp}
    let lo = 0;
    let hi = list.length - 1;
    // @why Answer if nothing qualifies; stays empty when every timestamp is too new.
    // @say Start with no answer: if every entry is newer than {timestamp}, the key had no value yet.
    let res = "";
    // @why Binary search over the timestamps.
    // @yes {lo === hi ? "Only entry " + lo + " is left undecided, so check it." : "Entries " + lo + ".." + hi + " are still undecided, so probe the middle."}
    // @no Every entry is sorted into "at or before {timestamp}" or "after it". res holds the newest of the first group{res ? ": " + JSON.stringify(res) : ", and there is none"}.
    while (lo <= hi) {
      // @why Look at the middle entry.
      // @say Probe entry {(lo + hi) >> 1}: time {list[(lo + hi) >> 1][0]}.
      const mid = (lo + hi) >> 1;
      // @why This entry is not too new, so it could be the answer.
      // @yes Time {list[mid][0]} ≤ {timestamp}: the value "{list[mid][1]}" was in effect by then, so it is a candidate. A later entry might still fit too.
      // @no Time {list[mid][0]} > {timestamp}: this value was set after the moment asked about, and every later entry is even newer.
      if (list[mid][0] <= timestamp) {
        // @why Remember it, then look right for a later timestamp that still fits.
        // @say "{list[mid][1]}" (time {list[mid][0]}) is the newest fitting entry found so far.
        res = list[mid][1]; // @moment fits: {list[mid][0]}
        // @why Move right to find a newer valid entry.
        // @say Look right of entry {mid} for a newer one that still fits.
        lo = mid + 1; // @ask lo
      // @why This entry is too new.
      } else {
        // @why Move left to older entries.
        // @say Discard entry {mid} and everything after it; look at older entries.
        hi = mid - 1; // @ask hi
      }
    }
    // @why Return the latest valid value found.
    // @phase Answer
    // @returns {res ? JSON.stringify(res) + ": the newest value set at or before time " + timestamp : "\"\": every entry for " + key + " is newer than " + timestamp}.
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
