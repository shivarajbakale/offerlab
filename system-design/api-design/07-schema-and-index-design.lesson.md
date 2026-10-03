# Schema and index design

## What it is

- **What it is:** Choosing tables and indexes so every query an API offers is fast. An index is a sorted copy of some columns that lets the database jump straight to the matching rows instead of reading the whole table.
- **The problem it solves:** A query whose filter does not match the leading columns of an index reads every row of the table, so an endpoint that is fast on test data becomes the slow one at 100 million rows. Designing indexes from the query list makes each query read about as many entries as it returns.
- **Reach for it when:** An endpoint filters or sorts by some columns, a table is growing large, a query plan shows a full scan, or you are deciding which filters and sorts an API will allow.
- **Not the right tool when:** The table is small: a full scan is fine and an index only slows writes. For full-text search, or analytics over many columns, a search engine or a column store fits better than more [B+ tree](#/sd-03-storage/010-b-plus-tree) indexes.
- **Where you'll meet it:** `EXPLAIN` in PostgreSQL and MySQL; Markus Winand's book "SQL Performance Explained" and his site Use The Index, Luke; covering indexes with `INCLUDE` in PostgreSQL and SQL Server; data-model rounds in system design interviews.

## Words we'll use

- **Table** — rows stored by their primary key (`id`). Reading one row by id is a **lookup**.
- **Full scan** — reading every row of the table and testing each one. Cost grows with the table, not with the answer.
- **Index** — a separate, sorted list of (some columns, row id) that the database keeps up to date. Real databases store it as a B-tree; a sorted array behaves the same for reads.
- **Composite index** — an index on several columns, sorted by the first, then by the second within equal firsts. `(user, day)` is sorted by user, and by day inside each user.
- **Seek** — a binary search into the index to the first entry at or after a key: about log₂(n) reads here (a real B-tree needs only 3-4 page reads even for hundreds of millions of rows, since each page holds hundreds of keys).
- **Leftmost prefix** — the leading columns of an index, in order: `(user)`, then `(user, day)`. A seek can only use conditions on a leftmost prefix.
- **Range** — a condition like `day BETWEEN 2 AND 4`, as opposed to an **equality** like `user = 4`.
- **Covering index** — an index that holds every column a query needs, so the query never reads the table. `INCLUDE (total)` adds a column to the entries without making it part of the sort.
- **Query plan** — how the database chose to answer a query (which index, how many rows read, whether it sorted). `EXPLAIN` shows it.

## The world we're in

- An `orders` table: `id, user, day, status, total`. Six users each order once a day for six days: 36 rows.
- Rows were inserted in the order they were placed, day by day, so one user's orders are spread across the table.
- The API needs: one user's orders by day, one user's orders in a date range, and every order on one day.
- Every index must be updated on every insert.

## The goal

Answer each API query by reading about as many entries as it returns, plus a seek, and know exactly which queries an index can serve before adding it.

## The naive attempt

"We have an index on `(user, day)`, and the query filters on `day`, so it is indexed." It is not. Ask for every order on day 5.
[▶ Broken: no index can seek on day alone](play:broken: day = 5@at=prefix#1)
The planner counts how many leading index columns have an equality condition. The first column, `user`, has none, so the count is zero and the index is useless for a seek. The database reads every row.
[▶ Broken: a full scan starts](play:broken: day = 5@at=full-scan#1)
[▶ Broken: all 36 rows read to return 6](play:broken: day = 5@at=scanned#1)
Day 5's orders exist in the index, but they are scattered: one inside each user's run of entries. There is no single place to seek to. At 36 rows this is nothing; at 100 million it is the slow endpoint.

## Building it up

**1. An index is a sorted list.** `(user, day)` holds 36 entries: user 1's days 1-6, then user 2's, and so on. Keeping it sorted costs a binary search and an insert on every write.
[▶ A new order finds its place in the index](play:writes: every index@at=index-write#1)

**2. Equality on the first column: seek, then walk.** For `user = 4` the database seeks to the first entry for user 4 in 5 reads (log₂ 36 is about 5), then walks forward. The first entry for user 5 ends the walk: 7 entries read for 6 orders.
[▶ The planner picks (user, day)](play:index (user, day): user = 4 seeks@at=prefix#1)
[▶ Walking user 4's entries](play:index (user, day): user = 4 seeks@at=walk#1)
`total` is not in the index, so each match pays a lookup into the table.
[▶ One lookup per match](play:index (user, day): user = 4 seeks@at=lookup#1)
And because entries for one user are already sorted by day, `ORDER BY day` costs nothing.
[▶ Six orders, in day order, no sort](play:index (user, day): user = 4 seeks@at=answer#1)

**3. Equality, then a range on the next column.** `user = 4 AND day BETWEEN 2 AND 4` seeks to (4, 2) and stops at (4, 5): 4 entries read for 3 orders. This is the shape composite indexes are built for.
[▶ The seek lands on (4, 2)](play:index (user, day): user = 4 and day 2..4@at=walk#1)
[▶ (4, 5) is past the range and ends the walk](play:index (user, day): user = 4 and day 2..4@at=walk#4)

**4. After a range, the rest of the key is only a filter, and its order is lost.** `user BETWEEN 2 AND 3 ORDER BY day` can seek on the range, but entries come out as user 2's days 1-6, then user 3's days 1-6. That is not day order, so the database must sort.
[▶ Sorted by day only within each user: a sort is needed](play:index (user, day): a range on user@at=sort#1)
Add `day = 5` to that range and day still cannot narrow the seek. It is tested on each of the 13 entries, before any lookup, so only the 2 matches pay for one.
[▶ day = 5 is checked on the entry](play:index (user, day): with a range on user@at=filter#1)
[▶ Only the matches are looked up](play:index (user, day): with a range on user@at=lookup#1)

**5. Covering: put what the query reads in the index.** `(user, day) INCLUDE (total)` stores `total` in each entry. `SELECT day, total WHERE user = 4` now never touches the table: zero lookups.
[▶ Answered from the index entry](play:covering: (user, day) INCLUDE@at=covered#1)

**6. Fix the broken query with an index that starts with day.** An index on `(day)` makes day 5 one contiguous run: a seek and 7 entries instead of 36 rows.
[▶ The planner picks (day)](play:index (day): a second index@at=use-index#1)
[▶ 6 orders from 7 entries](play:index (day): a second index@at=answer#1)

## Why it works now

A seek needs one place in the sort order where the answer starts and one where it ends. Equality on the leading columns, then at most one range on the next, describes exactly such a stretch. A condition on a later column alone describes many small stretches scattered through the index, so the database falls back to reading everything.
[▶ Broken: day alone is scattered, so: full scan](play:broken: day = 5@at=full-scan#36)
[▶ An index led by day makes it one stretch](play:index (day): a second index@at=walk#1)

## What it costs

- **Every index taxes every write.** With three indexes each order is four writes: the row and three sorted inserts. Updates that change an indexed column pay too, and so does every delete. [▶ One order, four writes](play:writes: every index@at=written#1)
- **Space and memory.** Each index is another copy of its columns plus the row id. Hot indexes want to fit in memory.
- **Covering is not free.** `INCLUDE` columns make entries bigger and must be rewritten whenever those columns change. And "never touches the table" is the model: in PostgreSQL an index-only scan still checks the visibility map and reads the table for recently changed pages until VACUUM marks them all-visible (EXPLAIN ANALYZE shows these as Heap Fetches).
- **One range per index.** Columns after a range only filter. If two queries need different ranges, they need different indexes.
- **Simplified here.** Our planner only scores leftmost prefixes. Real planners also estimate how many rows each choice returns and may prefer a full scan when a query matches most of the table. They may also scan a whole smaller index instead of the table, and engines with skip scan (MySQL 8.0.13+, PostgreSQL 18+) can use a later column after an equality-less or range prefix.

## Staff notes

- Design indexes from the query list, not the schema: equality columns first, then the range or `ORDER BY` column, then `INCLUDE` what the hot query selects.
- Run `EXPLAIN` (or `EXPLAIN ANALYZE`) on every hot query and in code review for new ones. "Seq Scan" or "type: ALL" on a large table is the usual cause of a slow endpoint.
- Some databases (Oracle, MySQL 8.0.13+, PostgreSQL 18+) can skip-scan a composite index without its leading column, probing once per distinct leading value. It helps when the leading column has few values; it is not a substitute for the right index.
- Watch for unused indexes (PostgreSQL's `pg_stat_user_indexes`, MySQL's `sys.schema_unused_indexes`) and drop them: they cost on every write and help nothing.
- An API's filter and sort parameters are a promise about indexes. Every combination you allow must be served by some index, or rejected, or it becomes a full scan someone will find.

## Check yourself

- **Q:** Why can't the index `(user, day)` seek for `day = 5`?
  A: The index is sorted by user first; day 5's entries are scattered, one inside each user's run, so there is no single place to start. The planner's leftmost-prefix count is zero and it scans all 36 rows. [▶ Show it](play:broken: day = 5@at=scanned#1)
- **Q:** `WHERE user = 4 AND day BETWEEN 2 AND 4`: how many index entries are read, and why one more than the answer?
  A: 4 for 3 orders. The walk stops at the first entry past the range, (4, 5), which has to be read to know it is past. [▶ Show it](play:index (user, day): user = 4 and day 2..4@at=walk#4)
- **Q:** `WHERE user BETWEEN 2 AND 3 ORDER BY day`: why is there a sort?
  A: After a range on user, entries come out user by user, each sorted by day; the whole result is not in day order. [▶ Show it](play:index (user, day): a range on user@at=sort#1)
- **Q:** What does `INCLUDE (total)` buy for `SELECT day, total WHERE user = 4`?
  A: The entries hold total, so the query reads no rows from the table: zero lookups instead of six. [▶ Show it](play:covering: (user, day) INCLUDE@at=covered#1)
- **Q:** With three indexes, what does one insert cost?
  A: Four writes: the row plus one sorted insert per index. [▶ Show it](play:writes: every index@at=written#1)
