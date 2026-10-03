# Cursor pagination

## What it is

- **What it is:** A way to split a long list into pages where each page ends with a cursor: a token that says where the page stopped. The client sends it back to get the items after that point.
- **The problem it solves:** With "skip the first N items" paging, a new or deleted item shifts every page, so readers see some items twice and miss others, and deep pages get slower because the database reads and throws away every skipped row. A cursor names a point in the sort order, so pages stay stable and cost the same.
- **Reach for it when:** Infinite scroll, feeds, public list endpoints, and sync or export jobs that read everything; lists that change while being read, or are too long to count.
- **Not the right tool when:** Users need to jump to page 37 or see "page 3 of 120" in a small table that rarely changes: offset paging is simpler. Reading only what changed since last time needs a change sequence as the cursor, not a feed position.
- **Where you'll meet it:** Stripe's list endpoints, which page with `starting_after` and `ending_before` object ids; the Relay connection spec (`first`, `after`, `endCursor`) used by GitHub's GraphQL API; Slack's Web API `cursor` parameter; "Design a news feed" interviews.

## Words we'll use

- **Endpoint** — one URL of an API that clients call, such as `GET /feed`.
- **Page** — one slice of a long list, returned by one request. The **page size** (the `limit`) is how many items it holds.
- **Pagination** — splitting a long list into pages that the client asks for one after another.
- **Offset** — "skip this many items from the top": page 2 of size 4 is offset 4. In SQL, `LIMIT 4 OFFSET 4`.
- **Sort key** — the value the list is ordered by. Here the post id: a newer post has a larger id, and the feed shows the largest first.
- **Index** — a sorted copy of a column the database keeps so it can find a value without reading the whole table. Finding a value in it is a **seek**: about log₂(n) steps, like a binary search (in a real B-tree only 3-4 page reads even for hundreds of millions of rows, since each page holds hundreds of keys).
- **Cursor** — a token the server returns with a page that says where the page ended. The client sends it back to get the next page. **Opaque** means the client cannot read or build it; it only passes it back.
- **Keyset pagination** — paging by "items after this sort key" instead of by offset. Also called seek pagination.
- **Rows scanned** — how many rows the database read to answer a request, including ones it threw away. This is what a page really costs.

## The world we're in

- A feed of posts, newest first. Here there are 12 (ids 1 to 12) in the small scenarios and 200 in the cost scenarios.
- Clients read it one page at a time: an app scrolling, or a script syncing everything.
- While a client reads, other users add new posts (they go on top) and delete old ones.
- The database keeps an index on the post id, so it can seek to any id.

## The goal

Let a client read the whole feed page by page and see every post exactly once, even while posts are added and deleted, and make every page cost about the same, however deep it is.

## The naive attempt

"Page *n* is `LIMIT size OFFSET (n - 1) × size`. Return the next offset with each page."

While nothing changes this works: offsets 0, 4 and 8 return 12-9, 8-5 and 4-1.
[▶ Offset pages while nothing changes](play:offset: pages by position@at=scan#3)
Now a new post, 13, is added after the reader has seen page 1. It goes on top and pushes every post down one place. Post 9, which was the last of page 1, is now at position 4, the first slot of page 2. The reader sees it twice.
[▶ Broken: a new post goes on top](play:broken: offset — a post added@at=insert#1)
[▶ Broken: page 2 starts with 9 again](play:broken: offset — a post added@at=scan#2)
A deletion does the opposite. Post 11 is deleted after page 1 was read. Every later post moves up one place, so post 8 slides onto page 1, which the reader has already read, and page 2 starts at 7. Post 8 is never shown.
[▶ Broken: after a delete, page 2 starts at 7](play:broken: offset — a post deleted@at=scan#2)
And depth is expensive. A database answers `OFFSET 140` by reading 140 rows and throwing them away. Page 15 reads 150 rows to return 10; page 1,000 would read 10,000.
[▶ Broken: page 15 reads 150 rows](play:broken: offset — page 15@at=scan#1)

## Building it up

**1. Say where the page ended, not how far down it was.** An offset counts from the top, and the top moves. Instead, end each page with a cursor that names its last post: "the next page is everything older than post 9". Posts added above 9 or deleted elsewhere do not change what is older than 9.
[▶ The cursor names the last post of the page](play:cursor: three pages@at=next#1)

**2. Seek, don't skip.** To answer "older than 9", the database seeks in the index to the first id below 9 and reads the page from there. A seek is about log₂(n) steps wherever it lands, so a deep page costs the same as the first.
[▶ The seek lands on the first post older than the cursor](play:cursor: three pages@at=seek#2)
On 200 posts, the first page reads 8 index entries and 11 rows, and a page deep in the feed 7 and 11.
[▶ A deep page: a seek and one page](play:cursor: a deep page@at=seek#2)

**3. Ask for one extra row.** To know whether there is a next page, read `limit + 1` rows. If the extra row exists, return a cursor; if not, return none. No `COUNT(*)` over the whole table.
[▶ The last page returns no cursor](play:cursor: three pages@at=next#3)

**4. Make the cursor opaque.** The cursor is the last id, base64-encoded. Clients must treat it as a token: pass it back, never build or edit one. That leaves you free to change what is inside (add a timestamp, a filter, a signature) without breaking any client.

**5. Watch the same changes again.** A new post 13 arrives between pages: it is on top, above the cursor, and page 2 is still 8-5.
[▶ After the insert, page 2 is 8-5](play:cursor: a post added@at=seek#2)
Post 11 is deleted between pages: page 2 is still "older than 9", 8-5, and nothing is skipped.
[▶ After the delete, page 2 is still 8-5](play:cursor: a post deleted@at=next#2)

## Why it works now

An offset is a position counted from the top of a list that keeps changing at the top, so every insert or delete above the reader shifts the page boundary. A cursor is a value in the sort order itself; the boundary "older than 9" means the same thing before and after any other post comes or goes.
[▶ Broken: the offset boundary moved and 9 came back](play:broken: offset — a post added@at=scan#2)
And because the database seeks to that value in an index instead of counting rows from the top, page 1,000 costs what page 1 does.
[▶ A deep page costs one seek](play:cursor: a deep page@at=next#2)

## What it costs

- **No jumping.** "Go to page 37" and "page 3 of 120" need offsets and a count. Cursors only go next (and previous, with a second cursor).
- **A unique sort key and a matching index.** Sorting by `created_at` alone breaks ties unpredictably and can skip or repeat posts with the same timestamp. Sort by `(created_at, id)`, put both in the cursor, and index both in that order.
- **Fixed sort per cursor.** A cursor made for "newest first, only photos" means nothing for "oldest first". Encode the sort and filters in the cursor, or reject a mismatched one.
- **Items can still change.** A post edited after the reader passed it is not shown again. A cursor promises each position once, not a frozen snapshot.

## Staff notes

- Default to cursors for public APIs, infinite scroll and sync jobs. Offsets are fine for small admin tables with page numbers.
- The SQL is `WHERE (created_at, id) < (:c_at, :c_id) ORDER BY created_at DESC, id DESC LIMIT :n + 1`. PostgreSQL uses the index for this row comparison; in MySQL and SQL Server write it expanded, `created_at < :c_at OR (created_at = :c_at AND id < :c_id)`. Check the query plan uses the index for the seek; a cursor over an unindexed sort is as slow as an offset.
- Sign or encrypt cursors if their contents are sensitive, and give them an expiry if they hold anything that can go stale (a snapshot id, a search session).
- Return `next_cursor: null` on the last page rather than an empty page, so clients stop without one extra call.
- For "sync everything since last time", the cursor is a change sequence (a log position or an `updated_at, id` pair), not a feed position: that also catches edits. With `updated_at` or a sequence, a slow transaction can commit a value older than a cursor a reader already passed, and that row is never seen; re-read a safety window behind the cursor, or use a commit-ordered log (a WAL position or a CDC stream).

## Check yourself

- **Q:** The reader has page 1 (12-9). Post 13 is added. With offsets, what does page 2 start with, and why?
  A: With 9 again: the new post pushed every post down one place, so 9 is now at position 4, the first slot of page 2. [▶ Show it](play:broken: offset — a post added@at=scan#2)
- **Q:** With offsets, post 11 is deleted after page 1. Which post does the reader never see?
  A: Post 8. Everything moved up one place, so 8 slid onto page 1, already read, and page 2 starts at 7. [▶ Show it](play:broken: offset — a post deleted@at=scan#2)
- **Q:** Why does a cursor page deep in the feed cost the same as the first page?
  A: The database seeks to the cursor's id in the index (about log₂(n) reads) and reads one page; nothing before it is read. [▶ Show it](play:cursor: a deep page@at=seek#2)
- **Q:** How does the server know there is no next page without counting the table?
  A: It reads one row more than the page size. On the last page that extra row does not exist, so it returns no cursor. [▶ Show it](play:cursor: three pages@at=next#3)

## Deep dive

Why does `OFFSET` cost O(offset)? An index lets the database find a *value* quickly, because the index is sorted by value. It does not record positions: there is no cheap way to ask "what is the 10,000th entry?" without walking 10,000 entries, since every insert and delete would otherwise have to renumber everything after it. So `OFFSET 10000` walks and discards 10,000 rows (and often fetches each one from the table too). Keyset pagination turns the question into a value lookup, "first entry below id 9", which the sorted index answers in a seek. The same idea makes "infinite scroll" stable and makes bulk exports resumable: a crashed export restarts from the last cursor it stored, not from page 1.
