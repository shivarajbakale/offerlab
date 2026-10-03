# Social graph

## What it is

- **What it is:** The storage behind "follow" on a site like Twitter or Instagram: who follows whom, how many followers each account has, and whether you follow the account you are looking at.
- **What makes it hard:** Counting an account's followers by walking its list is fine for 200 followers and hopeless for 50 million, and storing everything about an account on one machine means a celebrity's machine takes a third of all traffic. Adding machines does not help, because one account is never split.
- **Building blocks it uses:** tables sorted for each question asked ([schema and index design](#/sd-api-design/07-schema-and-index-design)), follower lists paged with a [cursor](#/sd-api-design/01-cursor-pagination), and follower counts summed in batches from a queue, as in the [view counter](#/sd-architectures/10-view-counter).
- **Where you'll meet it:** "Design Twitter's follow system" or "Design Instagram" in interviews. Facebook's TAO paper (USENIX ATC 2013) describes a graph store with association lists and counts cached over MySQL, and Twitter open-sourced FlockDB, its sharded store for follower lists.

## Words we'll use

- **Follow** — user A subscribes to user B's posts. Stored as one **edge**: a row (follower A, followee B). **Unfollow** deletes the row. Both are **writes**.
- **Profile view** — opening B's profile: B's **follower count**, the first page of B's followers, and whether *you* follow B ("do I follow X"). This is a **read**.
- **Adjacency list** — for one account, the list of accounts it is connected to. "Followers of B" and "accounts A follows" are two different adjacency lists built from the same edges.
- **Index** — a sorted copy of some columns that lets the database find rows without reading the whole table. An index on followee finds all of B's follower rows together.
- **Count query** — `COUNT(*)`, a query that counts matching rows. To count B's followers it must walk every one of B's index entries: cheap for 200 followers, slow for 50 million.
- **Denormalized counter** — storing the count as its own number, updated on every follow, so reading it is one lookup.
- **Shard** — one slice of the data on its own database machine. **Sharding by account** puts everything about account B on the shard picked by B's id.
- **Zipf distribution** (**skew**) — popularity where the top key gets the most traffic, the second about half as much, and so on. A higher skew makes the top keys take a bigger share.
- **Hot shard** — a shard that gets far more traffic than the others, because a popular key lives on it.
- **Queue** — a list of jobs waiting to be done by **consumers** in the background. **Fan-out** of 0.02 means one job per 50 messages (a batch).
- **Cache-aside** — ask an in-memory cache first; on a **miss**, read the database and keep the answer. **Hit rate** is the share answered by the cache. **TTL** is how long a copy is kept.
- **Cursor pagination** — asking for "the next 50 followers after follower id 81723" instead of "page 400": the database jumps straight to that point in the index.

## The world we're in

- 10,000 requests a second: 96% profile views, 4% follows and unfollows.
- 1,000,000 accounts. Popularity is Zipf-shaped: on a normal week (skew 1) the most viewed account gets about 7% of requests.
- The week a celebrity joins (skew 1.5), that one account gets about 39% of all requests: its profile is opened 3,700 times a second and it gains followers 150 times a second.
- Six app servers, never the limit here. A database machine has 4 cores.
- A follower count can be a few seconds behind. "Do I follow X" must be right for the person asking, right after they press Follow.

## The goal

Answer every profile view and follow at 10,000 a second, and keep doing it the week one account takes 39% of the traffic.

## The naive attempt

"One table, follows(follower, followee), with an index on followee. A profile view runs `COUNT(*)`, reads the first page and checks whether (B, me) exists."

The count walks B's whole follower list on every view. Say the three queries cost 8 ms on average (for a celebrity, the count alone would take far longer; the simulator uses one average). At 400 requests a second the database is 78% busy and fine.
[▶ 400 requests a second](play:count on read: 400@t=8)

At 10,000 a second, 4 cores at 8 ms answer about 500 a second. Almost every request fails. The app servers are 2% busy, so more of them do nothing.
[▶ Broken: counting on every profile view](play:broken: count on read@t=8)

## Building it up

**1. Count once, at write time.** A follower count is read thousands of times for every time it changes. So store it: a row (B, count) that every follow adds 1 to, in the same transaction that inserts the edge. Now a profile view is a few lookups: the count row, the first 50 rows of B's follower index, and the single row (B, me). Say 1.5 ms instead of 8.

**2. Store each edge twice, and shard both copies by account.** Two questions come up all the time: "who follows B?" (B's profile) and "whom do I follow?" (my home feed, my following page). Each wants the edges stored next to a different account. So keep two tables:
- followers(B, follower), sharded by B, with B's count row on the same shard. A profile view and a follow of B touch only B's shard.
- following(me, B), sharded by me. A queued job adds the edge there after the follow is saved. It is a separate machine, so it can be a moment behind; the follow itself is already stored.

With 8 followers shards, 10,000 requests a second pass with the busiest shard about 68% busy. The queue keeps the other direction up to date at about 400 jobs a second with no backlog. The bill is about $4.50 an hour.
[▶ Both directions, sharded by account](play:both directions, 8 shards@t=8)

**3. A celebrity joins.** Everything about one account lives on one shard. The celebrity's profile views alone are 3,700 a second × 1.5 ms ≈ 5.6 seconds of CPU per second, plus its follows: about 1.5 shards' worth of work for one shard. That shard is 100% busy, the others are under 45%, and app workers waiting on it run out, so about 4 in 10 requests fail, including views of ordinary accounts.
[▶ Broken: the celebrity's shard](play:broken: a celebrity joins@t=8)
More shards cannot help: one account is never split. With 32 shards, half of them are under 5% busy, the bill is almost three times higher ($12.70 an hour), and the celebrity's shard is still full.
[▶ Broken: 32 shards, still full](play:broken: a celebrity on 32@t=8)

**4. Cache the part of a profile that is the same for everyone.** Of the three things on a profile, two are the same for every viewer: the count and the first page of followers. Cache them per account for 5 s. The count shown can be up to 5 s old, which nobody notices. The third, "do I follow X", is different for each viewer, so it is not cached here: it stays a single-row lookup of (X, me) on X's shard, about 0.5 ms. (The simulator charges 0.5 ms for every read on that table, cache misses included; a miss really costs about 1.5 ms, and only about 6% of views miss.)

Follows of the celebrity still add 1 to one count row 150 times a second, and every one of those waits for the lock on that row. So stop updating the count on every follow: insert the edge, and put a "+1 for B" on a queue. Consumers add up about 50 at a time and write one sum (case study 10 does this for view counts). 400 follows a second become under 10 count writes a second.

The celebrity's week now runs with no errors. The cache answers about 94% of profile views. The celebrity's shard drops to about 59% busy, nearly all of it "do I follow X" lookups and the inserts of new edges, and the other shards are under 30%. The one cache machine is about half busy: every profile view asks it once.
[▶ The celebrity's week, with the shared part cached](play:cached shared part@t=8)

**5. For the very largest accounts, ask the other direction.** "Do I follow X" can also be answered from following(me, X), on *my* shard, which is spread evenly however famous X is. For a celebrity that moves the 3,700 lookups a second off X's shard entirely. But following(me, X) is written by the queued job from step 2, a moment behind, and "do I follow X" must be right the instant I press Follow. So either write my own direction synchronously in the follow (my shard is ordinary, so this is cheap), or have the client show its own just-made follow until the copy catches up. The simulator cannot send one request to two different shards, so this step is described, not simulated.

## Why it works now

Each question goes to the copy of the graph sorted for it, and the counts are computed once per follow instead of once per view. The celebrity could not be fixed by more shards because one account lives on one shard.
[▶ Broken: 32 shards, one of them full](play:broken: a celebrity on 32@t=5)
It was fixed by noticing that most of what its viewers read is identical, and reading that from memory.
[▶ The same week, cached](play:cached shared part@t=5)

## What it costs

- **Two copies of every edge.** Twice the storage, and two writes per follow. The second copy is updated by a queued job, so it can lag or, if the job is lost, be wrong; a periodic job must compare the two and repair differences.
- **Stored counts drift.** An update lost or applied twice leaves a count wrong forever, unless something recounts from the edges now and then. Batched counts are also a little behind.
- **Cached counts are up to 5 s old.** Fine for "12.3M followers"; not fine if the number decides money (creator payouts are computed from the edges, not the cached count).
- **One cache machine takes every view.** At 10,000 a second it is about half busy. The celebrity's key lives on one cache machine too; at higher rates, copy the hottest keys onto several cache machines.
- **Unfollow storms** (an account bought fake followers and they are removed at once) hit the same shard and count row as follow storms.

## Staff notes

- Ask which questions the product needs: followers of X, whom I follow, do I follow X, mutual follows ("followed by 3 people you know"). Each wants a different storage order. Mutual follows need an intersection of two lists, usually precomputed for small lists and sampled for big ones.
- Page follower lists with a cursor (the last follower id seen; see the API track's cursor pagination). OFFSET 2,000,000 makes the database walk two million index entries to throw them away.
- Treat the top accounts as a separate tier: known, monitored, cached, counts batched. There are few of them and they cause most of the hot spots.
- Sharding by account keeps "everything about X" on one machine, which makes most queries one-shard. It also guarantees a celebrity's shard is the hottest; plan for that from day one.
- Celebrity follower lists are also the hard part of the news feed (case study 06): pushing a post to 50 million followers is why big accounts are usually pulled at read time instead.

## Check yourself

- **Q:** At 10,000 requests a second the one database fails while the app servers are 2% busy. What is it spending its time on?
  A: Counting: every profile view walks the account's whole follower list, about 8 ms a view, so 4 cores answer about 500 a second. [▶ Show it](play:broken: count on read@t=8)
- **Q:** Why does storing each edge twice let both "who follows B" and "whom do I follow" go to one shard?
  A: Each copy is sorted and sharded by the account that asks: followers by B, following by me. [▶ Show it](play:both directions, 8 shards@t=8)
- **Q:** The celebrity's shard is full. Will 32 shards fix it?
  A: No. Its own views and follows need about 1.5 shards of CPU, and one account is never split across shards. Half the 32 shards sit under 5% busy. [▶ Show it](play:broken: a celebrity on 32@t=8)
- **Q:** With the profile cache, the celebrity's shard is still 59% busy. What is still reaching it?
  A: "Do I follow X" lookups, which differ per viewer and so are not in the shared cache, plus the inserts of new follow edges. [▶ Show it](play:cached shared part@t=8)
