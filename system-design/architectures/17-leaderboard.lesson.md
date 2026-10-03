# Leaderboard

## What it is

- **What it is:** The service behind a game's ranking page. It keeps every player's score on each board and answers two questions fast: who is in the top 100, and what position a given player holds.
- **What makes it hard:** Finding one player's position in a sorted database index means counting every score above theirs, which is slow on a board with millions of players. On a season's last night one board takes most of the traffic, and one board cannot be split across machines without losing exact positions.
- **Building blocks it uses:** a durable score table in SQL whose [B+ tree index](#/sd-03-storage/010-b-plus-tree) gives the top 100 but not a rank, Redis sorted sets placed whole on shards by a hash of the board id, the shared top 100 cached for one second (a [cache with a TTL](#/sd-low-level-design/02-lru-cache-with-ttl)), and a [replica](#/sd-05-replication/017-leader-follower-replication) of the hot shard so a failover is not a rebuild.
- **Where you'll meet it:** "Design a gaming leaderboard" is a standard interview question. Redis sorted sets (ZADD, ZREVRANK) are the usual tool, and the Redis docs use leaderboards as their example. The same "top N plus my rank" shape appears in contest rankings and trending lists.

## Words we'll use

- **Board** — one ranking: one game's scores for one season. There are 1,000 of them here.
- **Top N** — the N best scores on a board, in order. Here the board page shows the top 100.
- **Rank** — a player's position on a board: 1 + the number of players with a higher score.
- **Index** — a sorted copy of some columns that lets the database find rows without reading the whole table. A **B-tree** index keeps entries in order, so it can hand back the first 100 quickly.
- **Sorted set** — a Redis data type: members (player ids) each with a score, kept in score order. **ZADD** sets a member's score, **ZREVRANGE** returns members from the top, **ZREVRANK** returns a member's position counting from the top.
- **Skip list** — the structure behind a sorted set: a linked list with extra "express" links that skip ahead. Redis also stores how many members each link jumps over, so it can add up a member's position while it searches. Finding, inserting and ranking cost **O(log n)**: a few dozen steps for a million members.
- **Single-threaded** — Redis runs one command at a time on one CPU core. A machine with more cores does not make one Redis run more commands (newer versions can use extra threads to read and write network traffic, but commands still run one at a time).
- **Shard** — one slice of the data on its own machine. Here each board lives whole on one shard.
- **Hot key** — one key (here, one board) getting so much of the traffic that the machine holding it is overloaded.
- **TTL** (time to live) — how long a cached copy is used before it is fetched again.
- **Utilization** (busy) — the share of time a machine's cores are working; 100% means no spare capacity.

## The world we're in

- A **read** is a board page: the top 100 and your own rank. A **write** is a finished game: store the score, then tell the player their new rank. Reads are 80% of requests.
- A normal night: 2,000 requests a second. Board popularity is lopsided (Zipf): the top board gets about 13% of requests.
- A season's last night (the finale): 8,000 requests a second, and the finale board gets about 61% of them.
- The big boards have millions of players.
- Scores must not be lost. The top of the board may be a little late; a player's own rank should reflect their own new score.

## The goal

Serve the top 100 and any player's rank fast, at 8,000 requests a second, when most of them are about one board.

## The naive attempt

"Scores live in a SQL table with an index on (board, score). The page runs two queries."

The top 100 is cheap: the index is already in score order, so the database reads its first 100 entries. The rank is the problem. It is `SELECT COUNT(*) FROM scores WHERE board = ? AND score > ?`. A B-tree knows the order but not positions, so the database must step through every entry above you to count them. For a player half way down a million-player board that is about 500,000 entries. We charge 20 ms of CPU per page for it. 8 cores therefore manage at most 8 / 20 ms = 400 pages a second.

At 300 requests a second the database is 62% busy and nothing fails.
[▶ SQL at 300 a second](play:sql: 300@t=8)

At 2,000 a second it is 100% busy and more than 95% of all requests fail, score submissions as often as page views: a 2 ms insert waits in the same line as the 20 ms counts. The app servers are about 2% busy; adding more of them changes nothing.
[▶ Broken: SQL at 2,000 a second](play:broken: sql@t=8)

## Building it up

**1. Keep each board sorted in memory, with positions.** Make every board a Redis sorted set. A finished game first writes the score row to SQL (the durable record), then runs ZADD and ZREVRANK in Redis to get the new rank. A page view runs ZREVRANGE (top 100 with scores; since Redis 6.2 also written `ZRANGE ... REV`) and ZREVRANK, and never touches SQL. In the skip list each step of a search knows how many members it skipped, so the rank comes out of the search itself: O(log n), not O(rank). We charge 0.25 ms for a page (most of it sending back 100 members) and 0.05 ms for a score update.

At 2,000 a second, nothing fails, the median answer is under about 45 ms (almost all of it the network to the user), Redis is about 42% busy and the SQL table, now only taking inserts, is under 12%.
[▶ One sorted set per board](play:redis: one sorted set@t=8)

**2. See what one Redis cannot do.** Redis runs commands one at a time on one core. At the finale's 8,000 a second the work is 6,400 × 0.25 ms + 1,600 × 0.05 ms ≈ 1.7 seconds of CPU every second, on one core. Redis is 100% busy, between 30% and 50% of requests fail, and the app servers' workers are all held waiting on it.
[▶ Broken: one Redis on finale night](play:broken: one Redis on finale night@t=2.5)
There is a second reason to split, which the simulator does not show: memory. A sorted set entry costs on the order of 100 bytes in Redis (member, score, skip-list links, hash-table entry). If the thousand boards held a million players each, that is 1,000 × 1,000,000 × ~100 bytes ≈ 100 GB: too much to fit comfortably on one machine.

**3. Shard by board.** Put each board whole on one of four Redis primaries, chosen by a hash of the board id. All of a board's members are on one machine, so ZREVRANK still gives an exact rank and no query has to merge results from two shards. On a normal night at 8,000 a second, the four shards are between 30% and 60% busy and nothing fails.
[▶ Four shards, a normal night at 8,000 a second](play:shards: four@t=2.5)

On the finale, that same rule is the problem: the finale board is one key, and 61% of all requests go to its one shard. That shard is at 100%; the others stay under 30%. About 9% of requests fail, and some of them are for boards on the idle shards, because the app servers' workers are all stuck waiting on the hot one.
[▶ Broken: the finale board pins its shard](play:broken: sharded, finale night@t=2.5)
More shards would not help: one board cannot be split over machines without losing the exact rank (you would have to ask every piece "how many above this score?" and add up the answers on every page view). Read replicas of the hot shard would spread the page views (a little stale), but each replica would still run the same ZREVRANGE thousands of times a second; the next step caches the one shared answer, which removes that work instead of copying it.

**4. Cache what everyone sees.** Look at the finale's reads: thousands of people a second asking for the same top 100. That answer is the same for all of them, and it is fine if it is a second old. So the app servers read it through a cache with a 1 second TTL: one refill per board per second, everything else answered from memory. (A player's own rank still comes back fresh from ZREVRANK when they submit a score; this is a simplification of the page.)

On the finale at 8,000 a second, nothing fails, 98% of page lookups hit the cache, and the finale board's shard drops from 100% to about 6% busy. What is left on it is the score updates.
[▶ The finale with a cached top 100](play:cache: the finale@t=2.5)

## Why it works now

Each stage removed a different kind of work. Redis turned a rank from a count proportional to the rank into a search of about 20 steps. Sharding gave the boards more cores and more memory. The cache stopped thousands of identical reads a second from reaching the one shard that cannot be split. The finale board's shard went from full
[▶ Broken: the hot shard full](play:broken: sharded, finale night@t=2)
to nearly idle, with the same traffic.
[▶ Same traffic, top 100 cached](play:cache: the finale@t=2)

Caching longer does not buy more. With a 60 second TTL the hot shard is still about 5% busy, because what remains is score updates, which a read cache cannot absorb; the top 100 is now up to a minute old.
[▶ Broken: a one-minute cache](play:broken: cache for a minute@t=2.5)

## What it costs

- Redis holds the boards in memory only. If a shard is lost, its boards must be rebuilt from the score table (or from a replica, if you run one). Plan how long that takes for the biggest board before the finale, not during it.
- Two writes per score: the SQL row and the ZADD. If the app dies between them, the sorted set misses a score until a repair job compares the two. Writing the score row first means the record is never the one that is missing.
- A cached top 100 is up to one TTL old. In the simulator over 90% of page views miss at least one score sent in the last second, because the finale board takes about 1,000 new scores a second. Most of those scores are nowhere near the top 100, so the visible list rarely changes, but "rarely" is not "never".
- Money: about $1.65 an hour for four shards and $1.80 with the cache, against $1.20 for one Redis that cannot survive the finale.

## Staff notes

- Ask how exact a rank must be. The top few thousand players care about exact positions; someone at position 4,812,331 is just as happy with "top 48%". A histogram of how many players are in each score range answers that with a few additions, and it can be sharded freely.
- Ties need a rule. Redis orders members with equal scores by the member string itself, unless you encode a tiebreak into the score, such as the score times a large number plus (a far-future time minus the submission time), so the earlier of two equal scores ranks first. Scores are 64-bit floating point numbers, so the combined value must stay below 2^53 to remain exact.
- Boards are naturally sharded by board, and only one board is ever the problem. Size the hot shard for the finale's score updates, cache its reads, and give it a replica so a failover does not mean a rebuild mid-event.
- A periodic snapshot (top 100 every second, written to a cache or a CDN) is the same idea as the cache here, pushed further out: one computation, read by everyone.

## Check yourself

- **Q:** With an index on (board, score), why does SQL still fail at 2,000 a second?
  A: The index gives the top 100 cheaply, but a rank is a COUNT of every entry above you, which is work proportional to the rank. 8 cores at 20 ms a page manage about 400 a second. [▶ Show it](play:broken: sql@t=8)
- **Q:** One Redis is 42% busy at 2,000 a second. Why not just buy a bigger machine for the finale?
  A: Redis runs commands on one core. A machine with more cores runs one Redis no faster; at 8,000 a second that core is full. [▶ Show it](play:broken: one Redis on finale night@t=2.5)
- **Q:** Four shards are fine on a normal night. Why do they fail on the finale, and why would sixteen not help?
  A: The finale board is one key on one shard, taking 61% of the traffic. More shards only move the other boards away. Read replicas would spread the reads, but each would repeat the same top-100 query; caching that one shared answer removes the work. [▶ Show it](play:broken: sharded, finale night@t=2.5)
- **Q:** What does the one-second cache trade away, and why does a longer one not help the shard?
  A: The top 100 can be a second old. What is left on the hot shard is score updates, which no read cache absorbs, so a minute-long TTL only makes the list older. [▶ Show it](play:broken: cache for a minute@t=2.5)

## Deep dive

How does a skip list return a rank in O(log n)? Each member sits on level 0, the plain linked list. Some also sit on level 1, fewer on level 2, and so on, chosen at random when inserted (Redis promotes a member one more level with probability 1 in 4, so about a quarter reach level 1 and a sixteenth level 2). Each forward link stores its **span**: how many level-0 members it jumps over. A search starts at the top level, moves forward while the next member still has a higher score than the target, and drops a level when it would overshoot. It adds up the spans of every link it follows. When it reaches the member, that sum is the member's position. Each level cuts the remaining distance by about four, so a million members take about 10 levels and a few steps per level. A B-tree could do the same if each node stored the number of entries below it (an "order-statistic tree"), but the B-tree indexes in common SQL databases do not keep those counts, because every insert would have to update the count in every node on its path to the root.
