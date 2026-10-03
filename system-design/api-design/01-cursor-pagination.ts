/**
 * 01. Cursor Pagination
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: An endpoint returns a feed of posts, newest first, too many to send at once, so the
 *   client asks for one page at a time. New posts arrive and old ones are deleted while a
 *   reader is paging. Every post must be shown once: no duplicates, nothing skipped. And page
 *   1,000 should cost the database no more than page 1.
 *
 * Approach: A cursor that names the last item seen (keyset pagination)
 *   Each page ends with an opaque cursor that encodes the last post's sort key (here its id).
 *   The next request asks for "posts older than that key", which the database answers by
 *   seeking straight to it in an index and reading one page. Inserts and deletes elsewhere do
 *   not move the boundary. Asking for one more row than the page size tells whether another
 *   page exists without counting the table.
 *
 * Cost: a cursor page costs one index seek (O(log n)) plus the page; an offset page reads and
 *   discards every row before it (O(offset + page)).
 *
 * Pattern: keyset (seek) pagination, opaque cursors
 * Key insight: An offset counts rows from the top, and the top moves: one new post shifts every
 *   later page down by one, so the reader sees a post twice; one deletion shifts them up, so a
 *   post is skipped. A cursor names a position in the ordering itself, which inserts and
 *   deletes elsewhere cannot move.
 * Tradeoffs: Cursors cannot jump to "page 37" or show a total page count; they only go to the
 *   next (or previous) page. The sort must be on a unique key, or a unique tiebreaker added
 *   (created_at, id), and an index must match it exactly.
 * Staff notes: Make the cursor opaque (base64 of the key, ideally signed) so clients cannot
 *   build or edit one and you can change what is inside without breaking them. Put the sort and
 *   filters inside the cursor, or reject a cursor used with different ones. Offset is fine for
 *   small admin tables with page numbers; public feeds and sync APIs want cursors.
 * Interview signals: "pagination", "infinite scroll", "page 1,000 is slow", "duplicates while
 *   scrolling", "LIMIT OFFSET", "next_page_token".
 * Real world: Slack (next_cursor), GitHub's GraphQL API (endCursor) and Google APIs
 *   (nextPageToken) page with opaque cursors; Stripe pages with starting_after, an object id. SQL
 *   databases execute OFFSET by reading and discarding the skipped rows.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Page = { items: number[]; next: string | null };

/** Posts by id, newest (largest id) first: the order an index on id, descending, keeps them in. */
export class Feed {
  // @viz array:ids window:from..to pointers:lo,hi values:limit,offset,after
  ids: number[] = [];
  // @why Rows the database had to read to answer the last request: what a page really costs.
  scanned = 0;

  constructor(count: number) {
    for (let id = count; id >= 1; id--) this.ids.push(id);
  }

  add(id: number) {
    // @why New posts have the largest id, so they go on top and push every other post down one place.
    this.ids.unshift(id); // @mark insert
  }

  remove(id: number) {
    this.ids.splice(this.ids.indexOf(id), 1); // @mark delete
  }

  /** The cursor way: `cursor` is null for the first page, else the token from the previous page. */
  pageAfter(cursor: string | null, limit: number): Page {
    const after = cursor === null ? Infinity : decode(cursor);
    // @why Seek: binary search the index for the first post older than the cursor's id. log2(n) reads, wherever it is.
    let lo = 0;
    let hi = this.ids.length;
    let reads = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      reads++;
      if (this.ids[mid] < after) hi = mid;
      else lo = mid + 1;
    }
    const from = lo; // @mark seek
    // @why Read one row more than the page: if it exists there is a next page, with no COUNT(*).
    const rows = this.ids.slice(from, from + limit + 1);
    const to = from + Math.min(limit, rows.length) - 1;
    this.scanned = reads + rows.length;
    const items = rows.slice(0, limit);
    // @why The next cursor names the last post on this page. Posts added above it or removed elsewhere cannot move it.
    const next = rows.length > limit ? encode(items[items.length - 1]) : null; // @mark next
    return { items, next };
  }

  /** The offset way: skip `offset` posts from the top, return `limit`. */
  pageAt(offset: number, limit: number): Page {
    const from = offset;
    const to = offset + limit - 1;
    // @why A database runs OFFSET by reading every skipped row and throwing it away: page 1,000 reads 1,000 pages' worth.
    this.scanned = Math.min(this.ids.length, offset + limit); // @mark scan
    const items = this.ids.slice(from, to + 1);
    return { items, next: offset + limit < this.ids.length ? String(offset + limit) : null };
  }
}

// --- helpers for the scenarios ---

// Quiet: cursors are opaque to clients. Inside, the last id seen, base64-encoded so nobody builds one by hand.
function encode(id: number): string {
  return btoa(`id:${id}`);
}

function decode(cursor: string): number {
  return Number(atob(cursor).slice(3));
}

const duplicates = (xs: number[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

test("cursor: three pages of four, newest first, and the last page says there is no more", () => {
  const feed = new Feed(12);
  const p1 = feed.pageAfter(null, 4);
  assert.deepEqual(p1.items, [12, 11, 10, 9]);
  const p2 = feed.pageAfter(p1.next, 4);
  assert.deepEqual(p2.items, [8, 7, 6, 5]);
  const p3 = feed.pageAfter(p2.next, 4);
  assert.deepEqual(p3.items, [4, 3, 2, 1]);
  assert.equal(p3.next, null);
});

test("cursor: a post added between pages does not shift the next page", () => {
  const feed = new Feed(12);
  const p1 = feed.pageAfter(null, 4);
  feed.add(13);
  const p2 = feed.pageAfter(p1.next, 4);
  assert.deepEqual([...p1.items, ...p2.items], [12, 11, 10, 9, 8, 7, 6, 5]);
});

test("cursor: a post deleted between pages is simply not there, and nothing else is skipped", () => {
  const feed = new Feed(12);
  const p1 = feed.pageAfter(null, 4);
  feed.remove(11);
  const p2 = feed.pageAfter(p1.next, 4);
  assert.deepEqual(p2.items, [8, 7, 6, 5]);
});

test("cursor: a deep page costs a seek and one page, like the first", () => {
  const feed = new Feed(200);
  feed.pageAfter(null, 10);
  const first = feed.scanned;
  const deep = feed.pageAfter(btoa("id:51"), 10);
  assert.deepEqual(deep.items, [50, 49, 48, 47, 46, 45, 44, 43, 42, 41]);
  // log2(200) is about 8 index reads, plus 11 rows: 8 + 11 for the first page, 7 + 11 deep in the feed.
  assert.equal(first, 8 + 11);
  assert.equal(feed.scanned, 7 + 11);
});

test("offset: pages by position work while nothing changes", () => {
  const feed = new Feed(12);
  const p1 = feed.pageAt(0, 4);
  const p2 = feed.pageAt(4, 4);
  const p3 = feed.pageAt(8, 4);
  assert.deepEqual([...p1.items, ...p2.items, ...p3.items], [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(p3.next, null);
});

test("broken: offset — a post added between pages shows the reader a post twice", () => {
  const feed = new Feed(12);
  const p1 = feed.pageAt(0, 4);
  feed.add(13);
  const p2 = feed.pageAt(4, 4);
  // The new post 13 pushed 9 down to position 4, the first slot of page 2.
  assert.deepEqual(p1.items, [12, 11, 10, 9]);
  assert.deepEqual(p2.items, [9, 8, 7, 6]);
  assert.deepEqual(duplicates([...p1.items, ...p2.items]), [9]);
});

test("broken: offset — a post deleted between pages makes the reader skip one", () => {
  const feed = new Feed(12);
  const p1 = feed.pageAt(0, 4);
  feed.remove(11);
  const p2 = feed.pageAt(4, 4);
  // Deleting 11 pulled 8 up to position 3, onto page 1, which the reader has already read.
  assert.deepEqual(p1.items, [12, 11, 10, 9]);
  assert.deepEqual(p2.items, [7, 6, 5, 4]);
});

test("broken: offset — page 15 reads 150 rows to return 10", () => {
  const feed = new Feed(200);
  const deep = feed.pageAt(140, 10);
  assert.deepEqual(deep.items, [60, 59, 58, 57, 56, 55, 54, 53, 52, 51]);
  assert.equal(feed.scanned, 150);
});
