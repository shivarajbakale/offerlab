# Distributed cache

## What it is

- **What it is:** A group of memory-only servers, such as Redis or Memcached, that sits in front of a database and keeps copies of popular records, so most reads never reach the database.
- **What makes it hard:** Once the database is sized for the cache, any moment when many reads miss at once becomes an outage: adding a server with simple hashing moves most keys, a restart empties everything, and keys filled together expire together. One viral key can also overload the single server that holds it.
- **Building blocks it uses:** keys placed on servers with [consistent hashing](#/sd-01-partitioning/001-consistent-hashing), and a small, short-lived copy of the hottest keys inside each app server (an [LRU cache with a TTL](#/sd-low-level-design/02-lru-cache-with-ttl)).
- **Where you'll meet it:** "Design a distributed cache" or "Design Memcached" is a common interview question. Facebook's 2013 paper "Scaling Memcache at Facebook" describes leases that stop stampedes, and Redis Cluster splits keys into 16,384 hash slots that it moves between nodes.

## Words we'll use

- **Cache** — a copy of data kept in memory so it can be read far faster than from the database. A **cache server** is a machine that only does this (Redis and Memcached are the usual ones). A **cache tier** is several of them.
- **Key** — the id of one record, such as a user id. The cache maps keys to copies of records.
- **Hit / miss** — a read that finds the key in the cache is a hit; one that does not is a miss and must go to the database. The **hit rate** is the share of reads that hit.
- **Cache-aside** — the app asks the cache first; on a miss it reads the database and stores the answer in the cache for next time. A write updates the database, then deletes the cached copy (**invalidation**) so the next read fetches the new value.
- **Hash** — a function that turns a key into a number that looks random but is always the same for the same key.
- **hash mod N** — picking a cache server by the remainder of the key's hash divided by the number of servers N. Every app server computes the same answer, so they all look in the same place.
- **Consistent hashing** — placing servers and keys on a circle of hash values, a key belonging to the next server clockwise. Adding or removing a server moves only the keys next to it. See [primitive 001, Consistent hashing](#/sd-01-partitioning/001-consistent-hashing).
- **Stampede** (also **thundering herd**) — many reads missing at the same moment and all going to the database at once.
- **TTL** (time to live) — how long a cached copy may be used before it must be fetched again.
- **Hot key** — one key read so often that the one server holding it is overloaded.
- **Local cache** (or **near cache**) — a small cache inside each app server's own memory, in front of the cache tier.
- **Stale read** — a read that returns an older value than the latest write.
- **Utilization** (busy) — the share of time a machine's cores are working. **Error** — a request that failed: turned away by a full server, or given up on after 1 second.
- **p50** — the middle latency: half the requests were faster.

## The world we're in

- 10,000 requests a second: 95% reads, 5% writes, over 100,000 records.
- Popularity is Zipf-shaped: on a normal day the most popular record gets about 8% of reads; on a viral day about 38%.
- The database has 8 cores and spends 2 ms on a read or a write. Writes take about one core, so it can serve about 3,500 reads a second.
- A cache server here has one core (Redis runs its commands on one thread) and spends 0.25 ms on a lookup: about 4,000 a second. Real servers are faster, but real traffic is bigger too; the ratios are what matter. Each holds up to 50,000 records and starts warm with the most popular ones.
- Four app servers, never the limit. Users are 1 ms away, so latencies are time spent in our systems.

## The goal

Serve 9,500 reads a second with a database that can serve 3,500, and keep doing it while cache servers are added, lost and restarted, and when one record goes viral.

## The naive attempt

"Every read queries the database."

9,500 reads a second arrive for a database that can serve about 3,500. It is at 100%, the app servers under 20% busy, and about 6 requests in 10 fail.
[▶ Broken: every read to the database](play:broken: no cache@t=8)

## Building it up

**1. Put a cache tier in front.** Four cache servers. A key lives on server hash(key) mod 4. A read asks that server first; a miss reads the database and stores the answer. About 90% of reads hit. The database is about 30% busy, the cache servers 50% to 80%, and the median request takes under 9 ms. All of it costs about $1.65 an hour.
[▶ Four cache servers, hash mod 4](play:mod N@t=8)

**2. Add a server, and watch the keys move.** Traffic grows; you add a fifth server. Now a key's server is hash(key) mod 5. A key stays where it was only if hash mod 4 equals hash mod 5. That is true for remainders 0 to 3 out of every 20, so one key in five stays and four in five now map to a server that does not have them. (Removing a server moves most keys in the same way.)

The simulator always places keys by hash mod N, so we model the move as five servers with four of them emptied at 4 s: 80% of the keys gone from where reads look. In the first second the hit rate falls under 55%. Every miss is a database read, so the database is at 100%, about a quarter of all requests fail and the median request goes over 60 ms. Each answered miss refills the cache, so it does recover, but slowly: the database is still full 2 to 4 seconds later, errors above 3%. Only by 8 to 10 s are errors under 2%. That is a stampede, caused by a routine change.
[▶ Broken: a fifth server with mod N](play:broken: a fifth server@t=5)

A full restart of the cache tier (an upgrade, a power event) does the same thing with 100% of the keys.

**3. Move only a fifth: consistent hashing.** Put the servers on a ring of hash values, each at many points, and give each key to the next server clockwise. A new server takes over only the keys just before its points, about a fifth of them; every other key stays on its server. We model this as five servers with only the new one empty.

The hit rate drops to about 80% for the first second, the database rises to about 57%, and nothing fails. The median request stays under 9 ms.
[▶ A fifth server on a ring](play:ring@t=5)

When a server dies, the ring hands its keys to the next servers clockwise. Those keys are cold there, so a fifth of the reads miss until they refill. The database must be able to take that: plan its capacity for "one cache server lost", not for the normal hit rate.

**4. Decide how long a copy may live (TTL).** Invalidation deletes the cached copy on every write. But invalidations get lost: a delete that fails, or a race where a slow read stores an old value just after a write deleted it. A TTL is the safety net: no copy lives longer than the TTL, so any wrong copy heals itself.

It costs hits. Every key is fetched again a TTL after it was filled, and a key read less than once per TTL is a miss nearly every time. With a 10-second TTL (runs here last seconds, so the TTL is seconds; real ones are minutes or hours, with the same arithmetic for keys read less often than that), the hit rate drops from about 90% to about 70%, and the database goes from about 30% to about 80% busy.
[▶ A 10-second TTL](play:ttl@t=8)

Keys filled together expire together: after a restart, everything filled in the same second expires in the same second a TTL later, a second stampede. Add random jitter to each TTL (say ±10%) so expiries spread out.

**5. See what a hot key does.** One record goes viral and gets 38% of all reads, about 3,800 a second. Consistent hashing spreads keys, not load: every read of that key goes to the one server that holds it, which can do about 4,000 lookups a second. It is at 100%; the other four are under 45%. The database is idle, because every read is a hit. And the app servers' workers all end up waiting on that one server, so reads of every other record fail too: about a quarter of all requests.
[▶ Broken: a hot key fills one cache server](play:broken: a hot key@t=8)

**6. Keep a local copy of the hottest keys in each app server.** Each app server keeps the 1,000 records it reads most in its own memory, for at most 1 second. The viral record is read thousands of times a second, so each app server fetches it from the cache tier about once a second and answers every other read itself. About 85% of reads now never leave the app server, every cache server is under 10% busy, the median request takes under 4 ms, and nothing fails. The simulator draws the local cache as its own box in front of the app servers; it costs no extra machines.
[▶ A local cache in each app server](play:local cache@t=8)

The catch: nothing invalidates the local copies. A write deletes the copy on the cache tier, but the copies inside every app server live on for up to 1 second. If the popular records also change often (here 5% of requests are writes, skewed like the reads, so the viral record changes about 190 times a second), a 1-second copy is almost always out of date: about 70% of reads return an old value.
[▶ Broken: a local cache on records that keep changing](play:broken: a local cache@t=8)
So a local cache fits records that are read constantly but change rarely: a celebrity's profile, a product page, a configuration value. A counter or a stock level needs a different fix: split the key into several copies on different servers, or batch its writes.

## Why it works now

A cache works by making most reads hits. Everything that breaks it is a moment when many reads miss at once: a server added with mod N, a restart, keys expiring together.
[▶ Broken: 80% of keys move](play:broken: a fifth server@t=5)
Consistent hashing makes routine changes move about 1/N of the keys instead of nearly all of them, so the database sees a bump instead of a flood.
[▶ A fifth of the keys move](play:ring@t=5)
And a hot key is not a placement problem at all: it is too many reads for one server, so the reads must be answered somewhere else, closer to the app.
[▶ The local cache](play:local cache@t=8)

## What it costs

- Every app server must agree on the ring: which servers exist and where their points are. That list is usually versioned and pushed from a configuration service, or kept by the cache cluster itself (Redis Cluster assigns 16,384 hash slots to nodes and moves slots between them).
- The database still needs headroom for the misses you will cause: a lost server, a deploy, a TTL wave.
- TTLs trade freshness for hit rate. Local caches trade it for load on the tier, with copies that no write can reach.
- Not simulated: the race between a read filling the cache and a write deleting it, request coalescing, warm-up, and the movement of keys between servers. The simulator always places keys by hash mod N and models a move by emptying servers.

## Staff notes

- Never restart or resize a whole cache tier at once. One server at a time, and wait for the hit rate to recover before the next.
- Coalesce misses: when many requests miss the same key at once, let one of them read the database and the others wait for its answer (single-flight, or a lease as in Facebook's memcache paper). One popular key that expires should cost one database read, not a thousand.
- Warm a new or restarted cache before it takes traffic, for example by reading through a warm one first.
- Watch hit rate and database load on the same chart. A falling hit rate is the warning; an overloaded database is the outage.
- Find hot keys before they find you: sample the keys each cache server serves, and alert when one key is a big share of one server's traffic.

## Check yourself

- **Q:** Adding one cache server to four flooded the database. Why?
  A: With hash mod N, going from 4 to 5 servers moves about 80% of keys to a server that does not have them. They all miss at once. [▶ Show it](play:broken: a fifth server@t=5)
- **Q:** What does consistent hashing change about that same addition?
  A: Only the new server's share, about a fifth of the keys, moves. The database rises to about 57% and nothing fails. [▶ Show it](play:ring@t=5)
- **Q:** Why does a 10-second TTL make the database so much busier?
  A: Every key is refetched 10 s after it was filled, and keys read less often than that miss nearly every time. The hit rate falls from about 90% to about 70%. [▶ Show it](play:ttl@t=8)
- **Q:** The viral record's server is at 100% while the database is idle. Why do other reads fail?
  A: The app servers' workers all wait on that one cache server, so requests for any record find no free worker. [▶ Show it](play:broken: a hot key@t=8)
- **Q:** When is a local cache the wrong fix for a hot key?
  A: When the record changes often. Local copies are not invalidated, so a 1-second copy of a record written many times a second is almost always stale. [▶ Show it](play:broken: a local cache@t=8)
