/**
 * 02. LRU Cache with TTL
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design an in-memory cache class. It holds at most `capacity` entries; when a new
 *   key would go over, it throws out the least recently used one. Every entry also has a time
 *   to live: after `ttlMs` it must never be returned again, even if nobody has touched it.
 *   get and put must both be O(1), and the class must be testable without waiting for real time.
 *
 * Approach: Hash map + doubly linked list, lazy expiry on read plus a bounded sweep
 *   A map finds a key's entry in O(1). A doubly linked list between two sentinel nodes keeps
 *   the entries in order of use: least recent next to `head`, most recent next to `tail`. A
 *   get or put unlinks the entry and relinks it before `tail`, both O(1) because the entry
 *   knows its neighbours. Each entry stores `expiresAt`; get checks it and treats an expired
 *   entry as a miss (lazy expiry). Entries nobody reads again would sit in memory, so a sweep
 *   with a fixed budget walks from the least recent end and removes expired ones. Time comes
 *   from an injected Clock, so tests move time forward by hand.
 *
 * Cost: get and put are O(1); sweep is O(budget); memory is O(capacity) entries, each with two
 *   pointers and an expiry time on top of the key and value.
 *
 * Pattern: hash map + doubly linked list, sentinels, lazy expiry, dependency injection (clock)
 * Key insight: The map answers "where is this key?" and the list answers "who is oldest?";
 *   neither can do the other's job in O(1). Expiry is a property checked when reading, not a
 *   timer per entry: a check on every get makes expiry correct, and the sweep only gives
 *   memory back.
 * Tradeoffs: Every get is a write (it moves the entry), so a thread-safe version needs a lock
 *   even for reads. Lazy expiry costs nothing per entry but leaves dead entries using memory
 *   until a read or the sweep finds them. Expire-after-write (here) bounds staleness; expiring
 *   after access instead keeps hot keys forever, which is wrong for data that changes.
 * Staff notes: Interviewers probe: what is the invariant (map size = list length <= capacity),
 *   why sentinels (no null checks at the ends), how to test expiry (inject the clock), how to
 *   make it thread-safe (one lock, or lock striping by shard of keys), and what happens to a hot
 *   key that expires (many callers miss at once and all reload it: a stampede; let one caller
 *   load while the others wait for its result).
 * Interview signals: "design an LRU cache", "O(1) get and put", "cache with expiry", "TTL",
 *   "how would you test it", "make it thread-safe".
 * Real world: Redis expires keys both lazily (on access) and with a periodic sampler over keys
 *   that have a TTL. Guava and Caffeine caches offer expireAfterWrite and expireAfterAccess and
 *   take a pluggable time source for tests. Java's LinkedHashMap in access order is this map
 *   plus linked list.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** Where the cache gets the time. Production passes the real clock; tests pass one they move by hand. */
export interface Clock {
  now(): number;
}

export class FakeClock implements Clock {
  // @why Milliseconds since the test began. Only advance() moves it, so a run is the same every time.
  t = 0;
  now(): number {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

/** One cached key: a node in the use-order list, so it can be unlinked from the middle in O(1). */
export class Entry {
  key: string;
  val: string;
  // @why The clock time after which this entry is dead. Checked on read; no timer runs per entry.
  expiresAt: number;
  // @why Neighbours in use order. Both links are what make "take it out of the middle" O(1).
  prev: Entry | null = null;
  next: Entry | null = null;
  constructor(key: string, val: string, expiresAt: number) {
    this.key = key;
    this.val = val;
    this.expiresAt = expiresAt;
  }
}

export class LRUCache {
  // @viz hide:clock values:capacity,ttlMs,budget,checked
  capacity: number;
  ttlMs: number;
  clock: Clock;
  // @why Key to entry: finds any key in O(1). Invariant: every entry in the map is in the list, and the other way round.
  map = new Map<string, Entry>();
  // @why Sentinels: fake first and last nodes. With them every real entry has a prev and a next, so linking needs no null checks.
  head = new Entry("HEAD", "", Infinity);
  tail = new Entry("TAIL", "", Infinity);
  // @why Counts for the scenarios: reads answered, and reads that found nothing usable.
  hits = 0;
  misses = 0;

  constructor(capacity: number, ttlMs: number, clock: Clock) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: string): string | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++; // @mark miss
      return undefined;
    }
    // @why Lazy expiry: the entry is still stored, but past its time it must not be returned. Remove it now that we have found it.
    if (this.clock.now() >= e.expiresAt) {
      this.remove(e); // @mark expired
      this.misses++;
      return undefined;
    }
    // @why A read counts as a use: move the entry to the most recent end. This is why a get changes the cache.
    this.unlink(e);
    this.pushRecent(e); // @mark touch
    this.hits++;
    return e.val;
  }

  put(key: string, val: string) {
    const now = this.clock.now();
    const old = this.map.get(key);
    if (old) {
      // @why Same key: new value, new expiry (expire-after-write), and it is now the most recent. The size does not change.
      old.val = val;
      old.expiresAt = now + this.ttlMs;
      this.unlink(old);
      this.pushRecent(old); // @mark update
      return;
    }
    const e = new Entry(key, val, now + this.ttlMs);
    this.map.set(key, e);
    this.pushRecent(e); // @mark insert
    // @why Over capacity by exactly one: the entry next to `head` is the least recently used, so it goes.
    if (this.map.size > this.capacity) {
      this.remove(this.head.next!); // @mark evict
    }
  }

  /** Removes expired entries, looking at no more than `budget` of them, starting from the least recently used end. */
  sweep(budget: number): number {
    const now = this.clock.now();
    let removed = 0;
    let checked = 0;
    let e = this.head.next!;
    // @why A fixed budget keeps one sweep from stalling the cache, however big it is. The next sweep carries on the cleanup.
    while (e !== this.tail && checked < budget) {
      const after = e.next!;
      checked++;
      if (now >= e.expiresAt) {
        this.remove(e); // @mark sweep
        removed++;
      }
      e = after;
    }
    return removed;
  }

  /** Least recent first: the order the list holds the keys in. */
  keys(): string[] {
    const out: string[] = [];
    for (let e = this.head.next!; e !== this.tail; e = e.next!) out.push(e.key);
    return out;
  }

  unlink(e: Entry) {
    e.prev!.next = e.next;
    e.next!.prev = e.prev;
  }

  pushRecent(e: Entry) {
    const last = this.tail.prev!;
    last.next = e;
    e.prev = last;
    e.next = this.tail;
    this.tail.prev = e;
  }

  /** Out of the list and out of the map together, so the two never disagree. */
  remove(e: Entry) {
    this.unlink(e);
    this.map.delete(e.key);
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: forgets the expiry check on read. Entries live until evicted for space or swept.
export class NoExpiryCheckCache extends LRUCache {
  get(key: string): string | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    this.unlink(e);
    this.pushRecent(e);
    this.hits++;
    // @why Returned whatever its expiresAt says: an entry past its time is served as if it were fresh.
    return e.val; // @mark stale
  }
}

// Broken on purpose: keeps use order in an array, so finding a key's place means scanning it.
export class ArrayLRU {
  capacity: number;
  // @why Keys, least recently used first. Moving one to the end means finding it first.
  order: string[] = [];
  vals = new Map<string, string>();
  // @why Array slots looked at so far: the cost the map + list design does not pay.
  scanned = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): string | undefined {
    if (!this.vals.has(key)) return undefined;
    let i = 0;
    // @why Walk from the oldest end until we find the key: O(n) for every get.
    while (this.order[i] !== key) {
      i++;
      this.scanned++; // @mark scan
    }
    this.scanned++;
    // @why splice shifts every later key down one place: also O(n).
    this.order.splice(i, 1);
    this.order.push(key); // @mark moved
    return this.vals.get(key);
  }

  put(key: string, val: string) {
    if (this.vals.has(key)) {
      this.vals.set(key, val);
      this.get(key);
      return;
    }
    this.vals.set(key, val);
    this.order.push(key);
    if (this.order.length > this.capacity) this.vals.delete(this.order.shift()!);
  }
}

function fill(cache: { put(k: string, v: string): void }, keys: string[]) {
  for (const k of keys) cache.put(k, k.toUpperCase());
}

test("recency: a get makes a key recent, so the least recently used one is evicted", () => {
  const clock = new FakeClock();
  const c = new LRUCache(3, 60_000, clock);
  c.put("a", "A");
  c.put("b", "B");
  c.put("c", "C");
  assert.equal(c.get("a"), "A");
  assert.deepEqual(c.keys(), ["b", "c", "a"]);
  c.put("d", "D");
  assert.equal(c.get("b"), undefined, "b was least recently used, so it was evicted");
  assert.deepEqual(c.keys(), ["c", "a", "d"]);
  assert.equal(c.map.size, 3);
});

test("update: putting an existing key changes its value and makes it recent, without evicting", () => {
  const clock = new FakeClock();
  const c = new LRUCache(3, 60_000, clock);
  c.put("a", "A");
  c.put("b", "B");
  c.put("c", "C");
  c.put("a", "A2");
  assert.equal(c.map.size, 3, "still three entries");
  c.put("d", "D");
  assert.deepEqual(c.keys(), ["c", "a", "d"], "b went, not a");
  assert.equal(c.get("a"), "A2");
});

test("ttl: an expired entry is a miss on read, and is removed right then", () => {
  const clock = new FakeClock();
  const c = new LRUCache(3, 1000, clock);
  c.put("a", "A");
  clock.advance(400);
  c.put("b", "B");
  clock.advance(500);
  assert.equal(c.get("a"), "A", "at 900 ms a is still fresh");
  clock.advance(100);
  // At 1000 ms a reaches its expiry; b (written at 400) has 400 ms left.
  assert.equal(c.get("a"), undefined);
  assert.equal(c.map.has("a"), false, "found expired, so removed");
  assert.equal(c.get("b"), "B");
  assert.deepEqual([c.hits, c.misses], [2, 1]);
});

test("sweep: entries nobody reads again are removed by a sweep with a budget", () => {
  const clock = new FakeClock();
  const c = new LRUCache(5, 1000, clock);
  fill(c, ["a", "b", "c"]);
  clock.advance(600);
  fill(c, ["d", "e"]);
  clock.advance(500);
  // At 1100 ms a, b and c are expired but still use memory: nobody has read them.
  assert.equal(c.map.size, 5);
  assert.equal(c.sweep(2), 2, "budget 2: looks at a and b only");
  assert.deepEqual(c.keys(), ["c", "d", "e"]);
  assert.equal(c.sweep(2), 1, "the next sweep finds c; d is still fresh");
  assert.deepEqual(c.keys(), ["d", "e"]);
  assert.equal(c.map.size, 2, "map and list agree");
});

test("broken: TTL never checked on read — a value is served long after it expired", () => {
  const clock = new FakeClock();
  const c = new NoExpiryCheckCache(3, 1000, clock);
  c.put("price:42", "$10");
  clock.advance(5000);
  // Five seconds later, five times the TTL: the correct cache says miss.
  assert.equal(c.get("price:42"), "$10", "the stale price is served");
  const good = new LRUCache(3, 1000, clock);
  good.put("price:42", "$10");
  clock.advance(5000);
  assert.equal(good.get("price:42"), undefined);
});

test("broken: array-based LRU — each get scans the array, so cost grows with the size", () => {
  const keys = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"];
  const arr = new ArrayLRU(8);
  fill(arr, keys);
  // The hot key is the most recent one, at the far end: reading it twice walks the array twice.
  arr.get("k8");
  arr.get("k8");
  assert.equal(arr.scanned, 16, "8 slots looked at for each of the two gets");
  // The map finds the entry at once, and moving it is a few pointer writes at any size.
  const c = new LRUCache(8, 60_000, new FakeClock());
  fill(c, keys);
  assert.equal(c.get("k8"), "K8");
  assert.equal(c.get("k8"), "K8");
  assert.deepEqual(c.keys(), keys);
});
