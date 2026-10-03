# N+1 queries and batching

## What it is

- **What it is:** N+1 is a slow pattern where code fetches a list with one query, then runs one more query for each item in it. Batching collects the keys the items need and fetches them all in one query.
- **The problem it solves:** Code that looks up each post's author one at a time makes 51 database round trips for a page of 50 posts, and the cost grows with the page while tests on tiny data never notice. A loader keeps the simple per-item code but sends one batched query.
- **Reach for it when:** GraphQL resolvers fill related objects, ORM code touches related records in a loop, a list endpoint gets slower as pages grow, or one service calls another once per item.
- **Not the right tool when:** Both tables are in one database and the response is flat: a JOIN, or the ORM's eager loading (Rails `includes`, Django `prefetch_related`), is simpler. A list that only ever holds one item has nothing to batch.
- **Where you'll meet it:** DataLoader, the batching library from Facebook used in many GraphQL servers; the Bullet gem, which warns about N+1 queries in Rails apps; Django's `select_related` and `prefetch_related`; Hibernate fetch joins; slow-endpoint questions in API interviews.

## Words we'll use

- **Query** — one request to the database: a SQL statement sent, rows sent back.
- **Round trip** — the time for one query to go to the database and its answer to come back. Even a fast indexed lookup pays it: the network both ways plus the database's own overhead. Here each query costs 1 ms.
- **Resolver** — the code that fills in one field of a response, such as "the author of this post". GraphQL servers are built from resolvers; REST handlers and ORM models have the same shape.
- **ORM** — object-relational mapper: a library that turns rows into objects. A **lazy-loaded association** (`post.author`) runs a query the first time you touch it.
- **N+1** — one query for a list of N items, then one more query per item: N+1 queries where 2 would do.
- **Batch** — one query that fetches many keys at once: `SELECT * FROM users WHERE id IN (3, 2, 1, 4)`.
- **Loader** — an object that collects the keys a request needs and fetches them in batches. **DataLoader** is the well-known JavaScript one.
- **Tick** — one pass of the event loop. DataLoader collects every key asked for during the current pass and sends one batch just after it. Here that moment is an explicit `dispatch()` call.
- **Per-request cache** — the loader remembers each key it has loaded for the rest of the request, so asking twice costs nothing.

## The world we're in

- Posts and users are in two tables. Each post has an `authorId`.
- The feed endpoint returns a page of posts, newest first, each with its author's name.
- Four users wrote the posts in turn, so a page of 10 has only 4 distinct authors.
- The code that finds a post's author is written once and runs once per post. That is the natural way to write it, and in GraphQL it is the default way.

## The goal

Return a page of posts with their authors in a fixed number of queries, whatever the page size, without giving up the simple per-post code.

## The naive attempt

"For each post, look up its author." One query for the posts, then one per post.
[▶ Broken: one query per post](play:broken: N+1 — 10 posts@at=per-post#1)
The line looks like one small piece of work, but it runs ten times, and each run is a round trip.
[▶ Broken: the tenth author lookup](play:broken: N+1 — 10 posts@at=one-user#10)
Ten posts cost 11 queries, and since only four people wrote them, user 3 is fetched three separate times.
[▶ Broken: 11 queries for 10 posts](play:broken: N+1 — 10 posts@at=naive-done#1)
It grows with the page: 50 posts cost 51 queries and 51 ms of round trips before any real work. Tests on a fixture with three rows never notice.
[▶ Broken: 51 queries for a page of 50](play:broken: N+1 — a page of 50@at=naive-done#1)

## Building it up

**1. Ask, don't fetch.** Keep the per-post code, but make it hand the author id to a loader instead of querying. The loader returns a slot that will hold the user later.
[▶ Each post asks for its author](play:batched: 10 posts@at=ask#1)

**2. Keep each key once.** The loader keeps a queue of ids and a cache of slots. An id it has seen before returns the same slot and adds nothing to the queue.
[▶ The first time user 3 is asked for, it is queued](play:batched: 10 posts@at=enqueue#1)
[▶ Asked for again: served from the cache](play:batched: an author asked for twice@at=cached#1)

**3. Fetch once, at the end of the tick.** When the pass over the page has asked for everything, the loader sends one `WHERE id IN (...)` query with the four distinct ids.
[▶ One batch query for four authors](play:batched: 10 posts@at=in-query#1)

**4. Match rows by id, not by position.** A database does not promise any order for `IN (...)` results. The loader builds a map from id to row and fills each slot from it. An id with no row (a deleted user) gets `null`, so no post is given the wrong author.
[▶ Rows arrive backwards and still land in the right slots](play:batched: rows that come back@at=fill#4)
[▶ A deleted author fills with null](play:batched: an author who no longer exists@at=fill#4)

**5. Count again.** Ten posts, 2 queries. Fifty posts, still 2 queries and 2 ms.
[▶ 2 queries for 10 posts](play:batched: 10 posts@at=done#1)
[▶ 2 queries for a page of 50](play:batched: a page of 50@at=done#1)

## Why it works now

The cost of N+1 was never the per-post code; it was a round trip inside the loop. The loader moves the I/O out of the loop: the loop now only records needs, and one place turns all of them into a single query. The number of queries now depends on how many *kinds* of data the response needs (posts, then users), not on how many items it has.
[▶ Broken: the round trip sat inside the loop](play:broken: N+1 — 10 posts@at=per-post#2)
[▶ Now the loop only collects ids](play:batched: 10 posts@at=ask#2)

## What it costs

- **Waiting for the batch.** No author comes back until every post has asked. For a page this is nothing; for a slow first item it means nothing streams early.
- **Big IN lists.** A batch of thousands of ids can hit a driver's parameter limit or get a worse plan than a few smaller batches, so loaders cap the batch size (DataLoader has a `maxBatchSize` option).
- **Nested levels.** Each level of the response (posts, their authors, the authors' teams) is its own batch, so a three-level response is about three or four queries, not one.
- **Cache staleness inside a request.** A request that loads a user, updates it, then loads it again through the same loader gets the old copy unless it clears that key.
- **The JOIN alternative.** `posts JOIN users` gets it in one query, but repeats each author's columns on every post row and needs both tables in one database. Loaders also work across services, where there is no JOIN.

## Staff notes

- Measure queries per request. A test that asserts "this endpoint makes at most 3 queries" catches N+1 the day it is written; traces and slow-query logs catch it in production. Reading the code rarely does, because the query hides behind a property access.
- ORMs give you eager loading: Rails `includes`, Django `select_related` (a JOIN) and `prefetch_related` (a second IN query), Hibernate fetch joins. Use them in list endpoints by default.
- In GraphQL, every field resolver for a related object should go through a loader. Create the loaders per request, in the request context.
- The batch function's contract: one result per key, in key order, with a null or an error for a missing key. Getting the order wrong silently gives posts the wrong author.
- The same shape appears between services: "fetch 50 user profiles" should be one call to a batch endpoint (`GET /users?ids=...`), not 50.

## Check yourself

- **Q:** Ten posts by four authors, written the naive way. How many queries, and how many times is user 3 fetched?
  A: 11 queries: 1 for the posts and 1 per post. User 3 wrote posts 10, 6 and 2, so it is fetched three times. [▶ Show it](play:broken: N+1 — 10 posts@at=naive-done#1)
- **Q:** With the loader, why does the IN list for ten posts hold only four ids?
  A: The loader queues each id once; a second request for the same id returns the cached slot. [▶ Show it](play:batched: 10 posts@at=in-query#1)
- **Q:** Why must the loader match rows to ids with a map instead of by position?
  A: The database may return the rows in any order, and a missing user returns no row at all; position would give posts the wrong author. [▶ Show it](play:batched: rows that come back@at=fill#1)
- **Q:** A page of 50 posts: how many queries naive, and how many batched?
  A: 51 naive (51 ms of round trips here), 2 batched. [▶ Show it](play:batched: a page of 50@at=done#1)
