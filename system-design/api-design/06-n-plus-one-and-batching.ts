/**
 * 06. N+1 Queries and Batching
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: An endpoint returns a page of posts, each with its author's name. Posts and users
 *   live in different tables (or different services). The code that resolves "the author of
 *   this post" is written once, per post, and looks harmless. A page of 50 posts must not
 *   cost 51 database round trips.
 *
 * Approach: A per-request loader that collects keys, then fetches them in one batch
 *   Resolving a post's author does not query. It hands the author id to a loader and gets back
 *   a slot to be filled. The loader keeps each id once (a per-request cache). When the
 *   current pass over the page has asked for everything it needs (here, an explicit
 *   dispatch; DataLoader does it at the end of the event-loop tick), the loader sends one
 *   query, WHERE id IN (...), and fills every slot by matching rows to ids.
 *
 * Cost: 1 query for the page plus 1 per kind of related thing, whatever the page size; the
 *   N+1 way is 1 + N queries. The IN list grows with the number of distinct keys.
 *
 * Pattern: batching, request-scoped memoization (DataLoader), eager loading
 * Key insight: Per-item code is the right way to write a resolver and the wrong way to talk
 *   to a database. The fix is to keep the per-item code and move the I/O: let each item
 *   declare what it needs, and let one place gather those needs into a single query.
 * Tradeoffs: The batch waits for the whole pass to finish asking, so nothing comes back
 *   early. A very long IN list can hit parameter limits or a worse query plan, so big batches
 *   are split. The per-request cache serves a value read earlier in the same request, which
 *   can be stale if the request also wrote it. A JOIN (eager loading) also avoids N+1 in one
 *   query but repeats each author's columns on every post row and couples the two tables.
 * Staff notes: N+1 hides in ORMs (lazy-loaded associations) and in GraphQL (one resolver per
 *   field per item) and passes every test on a 3-row fixture. Catch it by counting queries per
 *   request in tests and traces, not by reading code. The batch function must return one
 *   result per key in key order; a database does not return IN results in any order unless
 *   told to, so map rows back by id. Keep the loader per request, never global: a global
 *   cache leaks one user's data into another's request and never expires.
 * Interview signals: "the feed endpoint got slow as pages grew", "GraphQL resolvers",
 *   "ORM lazy loading", "hundreds of queries per request", "DataLoader".
 * Real world: Facebook's open-source DataLoader library (JavaScript) batches and caches loads
 *   per request and is the usual fix in GraphQL servers. Rails (includes / preload), Django
 *   (select_related for a JOIN, prefetch_related for a second IN query) and Hibernate (fetch
 *   joins, @BatchSize) offer eager loading for the same problem.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type User = { id: number; name: string };
export type Post = { id: number; authorId: number; title: string };
export type Slot = { id: number; user: User | null | undefined };
export type FeedItem = { title: string; author: string };

// @why Every query is a round trip: send the SQL, wait for the database, read the rows. We charge 1 ms each.
const ROUND_TRIP_MS = 1;

/** A tiny database that counts its queries: what the endpoint really costs. */
export class Database {
  // @viz hide:ROUND_TRIP_MS values:limit,id
  users = new Map<number, User>();
  posts: Post[] = [];
  // @why Round trips so far, and the time they took, for this request.
  queries = 0;
  elapsedMs = 0;
  log: string[] = [];
  // @why Real databases return IN (...) rows in no promised order. This flag returns them backwards to prove the loader copes.
  shuffle = false;

  selectPosts(limit: number): Post[] {
    this.roundTrip(`SELECT * FROM posts ORDER BY id DESC LIMIT ${limit}`); // @mark posts-query
    return this.posts.slice(0, limit);
  }

  selectUser(id: number): User | null {
    this.roundTrip(`SELECT * FROM users WHERE id = ${id}`); // @mark one-user
    return this.users.get(id) ?? null;
  }

  selectUsersIn(ids: number[]): User[] {
    this.roundTrip(`SELECT * FROM users WHERE id IN (${ids.join(", ")})`); // @mark in-query
    const rows: User[] = [];
    for (const id of ids) {
      const u = this.users.get(id);
      if (u) rows.push(u);
    }
    return this.shuffle ? rows.reverse() : rows;
  }

  roundTrip(sql: string) {
    this.queries++;
    this.elapsedMs += ROUND_TRIP_MS;
    this.log.push(sql);
  }
}

/** Collects user ids during one pass over the page, then loads them all in one query. */
export class UserLoader {
  db: Database;
  // @why Ids asked for since the last dispatch, each once.
  queue: number[] = [];
  // @why Per-request cache: id to the slot that holds (or will hold) that user. Asking twice returns the same slot.
  cache = new Map<number, Slot>();
  batches = 0;

  constructor(db: Database) {
    this.db = db;
  }

  load(id: number): Slot {
    const hit = this.cache.get(id);
    // @why Already asked for in this request: no new query, not even a new key in the batch.
    if (hit) return hit; // @mark cached
    const slot: Slot = { id, user: undefined };
    this.cache.set(id, slot);
    this.queue.push(id); // @mark enqueue
    return slot;
  }

  /** The end of the tick: everything this pass needed has been asked for. */
  dispatch() {
    if (this.queue.length === 0) return;
    const ids = this.queue;
    this.queue = [];
    this.batches++;
    const rows = this.db.selectUsersIn(ids); // @mark batch
    // @why Match rows to ids by id, never by position: the rows may come back in any order, and missing ids get null.
    const byId = new Map<number, User>();
    for (const row of rows) byId.set(row.id, row);
    for (const id of ids) {
      const slot = this.cache.get(id)!;
      slot.user = byId.get(id) ?? null; // @mark fill
    }
  }
}

/** The feed endpoint, resolving each post's author through the loader. */
export class FeedResolver {
  db: Database;
  loader: UserLoader;

  constructor(db: Database) {
    this.db = db;
    // @why One loader per request. Its cache dies with the request, so it never serves another user's data or a day-old row.
    this.loader = new UserLoader(db);
  }

  feed(limit: number): FeedItem[] {
    const posts = this.db.selectPosts(limit);
    // @why Each post says which author it needs. Nothing is fetched yet; the loader only collects ids.
    const slots: Slot[] = [];
    for (const post of posts) {
      slots.push(this.loader.load(post.authorId)); // @mark ask
    }
    this.loader.dispatch(); // @mark tick
    const items: FeedItem[] = [];
    for (let i = 0; i < posts.length; i++) {
      items.push({ title: posts[i].title, author: slots[i].user?.name ?? "(deleted)" });
    }
    return items; // @mark done
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: the obvious code. Each post fetches its own author, one query per post.
export class NaiveFeedResolver {
  db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  feed(limit: number): FeedItem[] {
    const posts = this.db.selectPosts(limit);
    const items: FeedItem[] = [];
    for (const post of posts) {
      // @why Looks like one line of work. It is one round trip, and it runs once per post: N more queries.
      const author = this.db.selectUser(post.authorId); // @mark per-post
      items.push({ title: post.title, author: author?.name ?? "(deleted)" });
    }
    return items; // @mark naive-done
  }
}

const NAMES = ["ada", "bo", "cy", "di"];

// Quiet: posts newest first, written by four users in turn (post 10 by user 3, post 9 by user 2, ...).
function seed(posts: number): Database {
  const db = new Database();
  for (let i = 0; i < NAMES.length; i++) db.users.set(i + 1, { id: i + 1, name: NAMES[i] });
  for (let id = posts; id >= 1; id--) db.posts.push({ id, authorId: (id % 4) + 1, title: `post ${id}` });
  return db;
}

test("batched: 10 posts and their authors cost 2 queries", () => {
  const db = seed(10);
  const items = new FeedResolver(db).feed(10);
  assert.equal(items.length, 10);
  assert.deepEqual(items[0], { title: "post 10", author: "cy" });
  assert.equal(db.queries, 2);
  // Ten posts, four distinct authors: the IN list holds each id once.
  assert.deepEqual(db.log, ["SELECT * FROM posts ORDER BY id DESC LIMIT 10", "SELECT * FROM users WHERE id IN (3, 2, 1, 4)"]);
  assert.equal(db.elapsedMs, 2);
});

test("batched: an author asked for twice is queued once and shares one slot", () => {
  const db = seed(4);
  const loader = new UserLoader(db);
  const a = loader.load(2);
  const b = loader.load(2);
  assert.equal(a, b);
  assert.deepEqual(loader.queue, [2]);
  loader.dispatch();
  assert.equal(a.user?.name, "bo");
  assert.equal(db.queries, 1);
});

test("batched: rows that come back in another order are matched by id", () => {
  const db = seed(10);
  db.shuffle = true;
  const items = new FeedResolver(db).feed(4);
  // Posts 10, 9, 8, 7 were written by users 3, 2, 1, 4, whatever order the rows arrived in.
  assert.deepEqual(
    items.map((x) => x.author),
    ["cy", "bo", "ada", "di"],
  );
});

test("batched: an author who no longer exists comes back as null, not as someone else", () => {
  const db = seed(4);
  db.users.delete(2);
  const items = new FeedResolver(db).feed(4);
  assert.deepEqual(
    items.map((x) => x.author),
    ["ada", "di", "cy", "(deleted)"],
  );
  assert.equal(db.queries, 2);
});

test("batched: a page of 50 still costs 2 queries and 2 ms", () => {
  const db = seed(50);
  new FeedResolver(db).feed(50);
  assert.equal(db.queries, 2);
  assert.equal(db.elapsedMs, 2);
});

test("broken: N+1 — 10 posts cost 11 queries, and each author is fetched again and again", () => {
  const db = seed(10);
  const items = new NaiveFeedResolver(db).feed(10);
  assert.deepEqual(items[0], { title: "post 10", author: "cy" });
  assert.equal(db.queries, 11);
  // Four authors, ten lookups: user 3 alone is fetched three times.
  assert.equal(db.log.filter((q) => q === "SELECT * FROM users WHERE id = 3").length, 3);
});

test("broken: N+1 — a page of 50 costs 51 queries and 51 ms", () => {
  const db = seed(50);
  new NaiveFeedResolver(db).feed(50);
  assert.equal(db.queries, 51);
  assert.equal(db.elapsedMs, 51);
});
