# LRU cache with TTL

## What it is

- **What it is:** A class that keeps a limited number of recent results in memory. When it is full it throws out the entry used least recently, and it never returns an entry older than its time to live, even one nobody has touched.
- **The problem it solves:** A cache that stores an expiry time but never checks it keeps serving data long after the real value changed, and one that tracks use order in an array walks every slot on each read, so the most popular keys cost the most. A hash map plus a doubly linked list makes get and put take the same short time at any size, and a check on every read makes expiry exact.
- **Reach for it when:** Reads far outnumber writes, the slow source behind the cache can change, memory is limited, and the interviewer asks for constant-time get and put or for expiry you can test without waiting.
- **Not the right tool when:** The cache must be shared by many servers: use a cache service such as Redis or memcached instead of one process's memory. When one big scan would push out all the hot keys, a policy that also counts how often keys are used (LFU, or Caffeine's W-TinyLFU) does better than LRU.
- **Where you'll meet it:** "Design an LRU cache" is a staple interview question. Java's LinkedHashMap in access order is this map plus list; Guava and Caffeine caches offer expireAfterWrite and expireAfterAccess and accept a Ticker so tests control time; Redis expires keys lazily on access and with a periodic sampler.

## Words we'll use

- **Cache** — a small, fast store that keeps copies of data that is slow to get (from a database, another service, a disk). A read that finds its key is a **hit**; one that does not is a **miss**, and the caller fetches from the slow source.
- **Capacity** — the most entries the cache may hold. Memory is limited, so a full cache must throw one out to take a new one. Throwing out is called **eviction**.
- **LRU (least recently used)** — the eviction rule "throw out the entry nobody has read or written for the longest time". Recently used data tends to be used again soon.
- **TTL (time to live)** — how long an entry may be served after it was written. After that it has **expired**: it may be out of date, so it must be treated as a miss.
- **Doubly linked list** — a chain of nodes where each node points to the one before (`prev`) and the one after (`next`). A node you are holding can be taken out of the middle in a few pointer writes.
- **Sentinel** — a fake node at each end of the list (`HEAD`, `TAIL`). Real nodes always have a neighbour on both sides, so the code never checks for "first" or "last".
- **Lazy expiry** — checking whether an entry has expired only when someone reads it, instead of running a timer for every entry.
- **Sweep** — a pass that looks for expired entries nobody is reading and removes them, to give their memory back.
- **Injected clock** — the cache asks a `Clock` object for the time instead of reading the system clock. A test passes a fake clock it moves by hand, so a one-hour TTL is tested in a millisecond.
- **Invariant** — a fact that must be true after every operation. Here: every key in the map is in the list and the other way round, and there are never more than `capacity` of them.

## The world we're in

- One process, one thread calling the cache (concurrency is in the staff notes).
- Keys and values are strings. Reads are far more common than writes, and a few hot keys get most reads.
- The data behind the cache changes, so a cached copy may be served for at most `ttlMs` after it was written.
- Time comes from `clock.now()` in milliseconds. Every scenario uses a `FakeClock`, so runs are repeatable.

## The goal

`get(key)` and `put(key, value)` in O(1) time, whatever the capacity. Never more than `capacity` entries; when full, evict the least recently used. Never return an entry at or past its expiry time. Give memory back from expired entries even if nobody reads them again.

## The naive attempt

There are two easy mistakes, one for each half of the problem.

**Expiry stored but never checked.** Each entry is written with an `expiresAt`, but `get` returns whatever it finds. A price is cached with a one-second TTL. Five seconds later, after the real price may have changed several times, the cache still answers `$10`.
[▶ Broken: a price five times past its TTL is served](play:broken: TTL never checked@at=stale#1)
Nothing evicts it for space either: the cache is far from full. An expiry nobody checks is just a number.

**Use order kept in an array.** Keep the keys in an array, least recent first; on every get, find the key and move it to the end. Finding it means walking the array. The keys read most are the most recent ones, which sit at the far end, so the hot key is the most expensive one to read.
[▶ Broken: reading the hottest key walks all 8 slots](play:broken: array-based LRU@at=scan#7)
[▶ Broken: and moving it means splicing the array](play:broken: array-based LRU@at=moved#1)
Two reads of one key looked at 16 slots. With a million entries, every hot read walks a million.

## Building it up

**1. A map for "where is it?".** A `Map` from key to entry finds any key in O(1). A miss is the map saying no.
[▶ A get for an evicted key: the map has nothing](play:recency@at=miss#1)

**2. A doubly linked list for "who is oldest?".** The entries are also nodes in a list, least recently used next to `HEAD`, most recent next to `TAIL`. The map stores the node itself, so once we have found a key we are already holding its place in the list. Unlinking it and pushing it before `TAIL` is six pointer writes (two to unlink, four to relink), at any size. Reading `a` makes it the most recent:
[▶ get(a): a moves to the most recent end](play:recency@at=touch#1)
This is why a get *changes* the cache. Remember that for concurrency.

**3. Evict from the `HEAD` end.** When a new key makes the map one over capacity, the node right after `HEAD` is by construction the least recently used. Remove it from the list and the map in one helper, `remove()`, so they never disagree.
[▶ put(d) on a full cache: b is evicted, not a](play:recency@at=evict#1)
Putting an existing key is not a new entry: it changes the value, moves the node to the recent end and keeps the size the same. Here `a` is rewritten, so when `d` arrives it is `b` that goes.
[▶ put(a) again: same size, a is recent now](play:update@at=update#1)
[▶ put(d): b is evicted](play:update@at=evict#1)

**4. Check expiry on read (lazy expiry).** Each entry stores `expiresAt = now + ttlMs` when written. `get` compares it with `clock.now()`; at or past it, the entry is removed and the read is a miss. No timer runs per entry; an entry costs nothing until someone reads it. With a 1,000 ms TTL, `a` is a hit at 900 ms and a miss at 1,000 ms, while `b`, written at 400 ms, is still fresh.
[▶ At 900 ms a is still served](play:ttl@at=touch#1)
[▶ At 1,000 ms a has expired: removed, and a miss](play:ttl@at=expired#1)

**5. A sweep with a budget for entries nobody reads.** Lazy expiry is correct but leaves dead entries using memory if no one asks for them again. `sweep(budget)` walks from the least recent end and removes expired entries, looking at no more than `budget` nodes so one sweep cannot stall the cache. Here `a`, `b` and `c` expired at 1,000 ms; at 1,100 ms a sweep with budget 2 removes `a` and `b`, and the next one removes `c` and stops at `d`, still fresh.
[▶ The first sweep removes a](play:sweep@at=sweep#1)
[▶ The second sweep removes c](play:sweep@at=sweep#3)
The sweep is only about memory. Correctness comes from the check on read: an expired entry the sweep has not reached is still never returned.

**6. Inject the clock.** The cache never calls `Date.now()`. It is handed a `Clock`. Tests use `FakeClock` and call `advance(5000)` instead of sleeping, so every TTL rule above is checked exactly and instantly.

## Why it works now

- The map gives O(1) lookup; the list gives O(1) "move to recent" and "remove oldest", because each node is reached through the map, never by walking. The array version walked to find the node.
  [▶ See it break](play:broken: array-based LRU@at=scan#7)
- Every path that removes an entry goes through `remove()`, which touches the list and the map together, so the invariant (same keys in both, at most `capacity`) holds after every call. The tests check the map size against the list after evictions and sweeps.
- Every `get` checks expiry before returning, so no expired value is served, however long it has been unread. Skip that check and a five-seconds-dead price is served.
  [▶ See it break](play:broken: TTL never checked@at=stale#1)

## What it costs

- **Memory per entry.** Two pointers and an expiry time on top of the key and value, plus the map's own overhead. For small values this overhead can be bigger than the value.
- **Reads are writes.** Every hit moves a node. In a multithreaded program that means a lock (or another way to record the use) even for reads.
- **Dead entries linger.** Between expiry and the next read or sweep, an expired entry still takes a slot. It can even push out a live entry, because eviction picks by use, not by expiry.
- **The sweep only looks from one end.** Here every entry gets the same TTL, but a recently read entry can still be old and expired; the sweep reaches it only after the older ones. Systems with a TTL per entry often keep a second order by expiry time (a heap or a timer wheel) instead.
- **LRU is not always the best rule.** One big scan (a report reading every key once) pushes out all the hot keys. Policies that also count frequency resist that, at more bookkeeping.

## Staff notes

- **Say the invariant out loud.** "Map and list hold the same entries, at most `capacity`, ordered by last use." Then show that `put`, `get`, `sweep` and eviction each keep it. That is what interviewers mean by "is it correct?".
- **Extensibility.** Keep the eviction rule and the expiry rule apart from the storage: an eviction policy interface (LRU, LFU, FIFO) and a per-entry TTL passed to `put`. Add a callback on removal so callers can log or close what was evicted.
- **Concurrency.** Simplest: one lock around every method, since even `get` moves nodes. Under load that lock is the bottleneck; split the cache into N shards by key hash, each with its own lock and list (approximate LRU across the whole cache). Caffeine, for example, records reads in buffers and applies them to the order in batches, so a read rarely waits for the lock.
- **Stampedes.** When a hot key expires, every caller misses at once and all hit the database. Let one caller reload while the others wait for its result (often called single-flight or request coalescing), or refresh shortly before expiry.
- **Testing.** Inject the clock; assert exact boundaries (at `expiresAt` the entry is gone, one millisecond before it is not); assert the invariant after every step; and test update-in-place separately from insert, because that is the path people forget.

## Check yourself

- **Q:** Capacity 3. put a, b, c, then get a, then put d. Which key is evicted, and why not a?
  A: b. Reading a made it the most recent, so b became the least recently used. [▶ Show it](play:recency@at=evict#1)
- **Q:** TTL 1,000 ms. a is written at 0 and read at 900 ms and at 1,000 ms. What does each read return?
  A: The value at 900 ms; a miss at 1,000 ms, because a read at or past `expiresAt` treats the entry as gone and removes it. [▶ Show it](play:ttl@at=expired#1)
- **Q:** Why is a sweep needed if every get checks expiry?
  A: For memory, not correctness: entries nobody reads again would otherwise stay until evicted. The budgeted sweep removes them a few at a time. [▶ Show it](play:sweep@at=sweep#1)
- **Q:** Why does keeping use order in an array make the hottest key the most expensive one to read?
  A: The hottest key is the most recent one, at the far end of the array, so finding it walks every slot before moving it. [▶ Show it](play:broken: array-based LRU@at=scan#7)
- **Q:** A cache stores `expiresAt` on each entry but `get` never looks at it. What happens to a price cached with a one-second TTL?
  A: It is served long after it expired, until the cache happens to evict it for space. [▶ Show it](play:broken: TTL never checked@at=stale#1)

## Deep dive

Why a doubly linked list and not a singly linked one? To unlink a node you must change its predecessor's `next`. With only `next` pointers, finding the predecessor means walking from the head: O(n) again. The `prev` pointer is what turns "remove this node" into O(1). The sentinels then remove the four special cases (removing the first node, the last node, the only node, inserting into an empty list): every real node has a real `prev` and `next`, so `unlink` and `pushRecent` are each a few lines with no `if`. Java's `LinkedHashMap` with access order on is exactly this map-plus-list; overriding its `removeEldestEntry` gives an LRU cache in a few lines.
