/**
 * 03. Optimistic Concurrency
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: Two clerks edit the same record through an API. Each reads it (stock: 10), changes
 *   it on their own screen, and writes the whole new value back. Alice sells 3 and writes 7;
 *   Bob, who read 10 too, sells 2 and writes 8. Bob's write silently undoes Alice's: the
 *   stock says 8 when it should say 5. Nothing failed, so nobody notices. This is a lost
 *   update.
 *
 * Approach: Every write says which version it was based on
 *   The record carries a version number that goes up on every write. GET returns it as an ETag
 *   header. A client that writes sends it back in If-Match: "write this only if the record is
 *   still the version I read". The server checks and writes in one step, a conditional update
 *   (UPDATE ... WHERE id = ? AND version = ?). If the version has moved, nothing is written and
 *   the server answers 412 Precondition Failed. The client reads the new version, redoes its
 *   change on top of it, and tries again. A write with no If-Match at all can be refused with
 *   428 Precondition Required.
 *
 * Cost: one integer column and a compare per write. A conflict costs the losing client one more
 *   read and write; there are no locks and nobody waits.
 *
 * Pattern: optimistic concurrency control, conditional requests, compare-and-set
 * Key insight: A read-modify-write is only correct if nothing changed between the read and the
 *   write. Instead of locking to make sure nothing does, check that nothing did, at the moment
 *   of the write, and refuse if it did. The version is the cheap proof.
 * Tradeoffs: Under heavy contention on one record most writes fail and retry, and work is
 *   wasted; a lock or a queue can do better there. The client must handle 412: reread, merge or
 *   redo, and sometimes ask a human. The check and the write must be one atomic step, or two
 *   writers can both pass the check.
 * Staff notes: For simple counters, avoid the read-modify-write altogether with a relative
 *   update (stock = stock - 3) done in the database. Use versions or ETags for whole-document
 *   edits: forms, config, documents. Require If-Match on PUT and PATCH of shared resources so
 *   no client can write blind. If-Match uses strong comparison, so a weak ETag (W/"...") never
 *   satisfies it. The same ETag gives you cheap revalidation: If-None-Match on GET answers 304
 *   Not Modified with no body.
 * Interview signals: "two users edit the same document", "lost update", "last write wins",
 *   "concurrent edits", "ETag", "version column", "without locking".
 * Real world: RFC 9110 defines ETag, If-Match, If-None-Match, 412 and 304; RFC 6585 defines 428.
 *   JPA's @Version and Rails' lock_version add a version column and a conditional update.
 *   Kubernetes rejects an update whose resourceVersion is stale with 409 Conflict. DynamoDB
 *   offers conditional writes with a condition expression.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Row = { stock: number; version: number };
type Headers = Record<string, string>;
export type Res = { status: number; headers: Headers; body: { stock: number } | null };

/** The database: one table of items, each with a version column. */
export class Db {
  // @why Item id to its row. `version` goes up by one on every write.
  rows = new Map<number, Row>();

  read(id: number): Row {
    const row = this.rows.get(id)!;
    return { stock: row.stock, version: row.version };
  }

  // @why UPDATE items SET stock = ?, version = version + 1 WHERE id = ? AND version = ?. Returns the rows it changed.
  updateIfVersion(id: number, stock: number, expected: number): number {
    const row = this.rows.get(id)!;
    // @why The check and the write are one statement, so no other write can land between them.
    if (row.version !== expected) return 0; // @mark staleRow
    row.stock = stock;
    row.version++; // @mark bump
    return 1;
  }

  // @why UPDATE items SET stock = ?, version = version + 1 WHERE id = ?: whatever happened since the read.
  update(id: number, stock: number) {
    const row = this.rows.get(id)!;
    row.stock = stock;
    row.version++; // @mark blindWrite
  }
}

/** GET and PUT /items/{id}. */
export class ItemsApi {
  db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  get(id: number, headers: Headers): Res {
    const row = this.db.read(id);
    // @why The ETag names this version of the item. Any write changes it.
    const etag = `"v${row.version}"`;
    // @why If-None-Match: the client already has this version cached. 304 says "still current", with no body.
    if (headers["If-None-Match"] === etag) return { status: 304, headers: { ETag: etag }, body: null }; // @mark notModified
    return { status: 200, headers: { ETag: etag }, body: { stock: row.stock } }; // @mark read
  }

  put(id: number, headers: Headers, body: { stock: number }): Res {
    const ifMatch = headers["If-Match"];
    // @why A write with no version could undo someone else's change unseen, so refuse it: 428 Precondition Required.
    if (ifMatch === undefined) return { status: 428, headers: {}, body: null }; // @mark noCondition
    const changed = this.db.updateIfVersion(id, body.stock, versionOf(ifMatch)); // @mark conditionalWrite
    // @why The version moved since this client read it. Nothing was written. 412 Precondition Failed.
    if (changed === 0) return { status: 412, headers: {}, body: null }; // @mark preconditionFailed
    const now = this.db.read(id);
    return { status: 200, headers: { ETag: `"v${now.version}"` }, body: { stock: now.stock } }; // @mark written
  }
}

/** A clerk's screen: reads an item, changes it, writes the whole new value back. */
export class Clerk {
  name: string;
  api: ItemsApi;
  // @why The ETag of the last read: the version this clerk's next write is based on.
  etag = "";
  // @why The stock this clerk last saw.
  seen = 0;

  constructor(name: string, api: ItemsApi) {
    this.name = name;
    this.api = api;
  }

  read(id: number) {
    const res = this.api.get(id, {});
    this.etag = res.headers.ETag;
    this.seen = res.body!.stock; // @mark saw
  }

  write(id: number, stock: number): Res {
    const res = this.api.put(id, { "If-Match": this.etag }, { stock }); // @mark send
    return res;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: ignores If-Match. Every write wins, whatever it was based on.
export class LastWriteWinsApi extends ItemsApi {
  put(id: number, _headers: Headers, body: { stock: number }): Res {
    // @why Writes the client's number as is. If another write landed after this client's read, it is erased.
    this.db.update(id, body.stock); // @mark overwrite
    return { status: 200, headers: { ETag: `"v${this.db.read(id).version}"` }, body };
  }
}

// Broken on purpose: checks the version in one step and writes in another. Another write can land between them.
export class CheckThenWriteApi extends ItemsApi {
  check(id: number, headers: Headers): boolean {
    // @why Only looks. By the time apply() runs, this answer may no longer be true.
    const ok = this.db.read(id).version === versionOf(headers["If-Match"]); // @mark checkOnly
    return ok;
  }

  apply(id: number, body: { stock: number }): Res {
    this.db.update(id, body.stock); // @mark applyLater
    return { status: 200, headers: { ETag: `"v${this.db.read(id).version}"` }, body };
  }
}

// Quiet: '"v3"' to 3. Anything else (a weak W/"v3", garbage) matches no version here. Simplified: in HTTP, If-Match: * matches any current version.
function versionOf(etag: string): number {
  const m = /^"v(\d+)"$/.exec(etag);
  return m ? Number(m[1]) : -1;
}

function shop(stock: number): { db: Db; api: ItemsApi } {
  const db = new Db();
  db.rows.set(1, { stock, version: 1 });
  return { db, api: new ItemsApi(db) };
}

test("one clerk: read v1, write with If-Match, the item is now v2", () => {
  const { db, api } = shop(10);
  const alice = new Clerk("alice", api);
  alice.read(1);
  assert.equal(alice.etag, '"v1"');
  const res = alice.write(1, 7);
  assert.equal(res.status, 200);
  assert.equal(res.headers.ETag, '"v2"');
  assert.deepEqual(db.read(1), { stock: 7, version: 2 });
});

test("two clerks: the second write gets 412, rereads, and both sales count", () => {
  const { db, api } = shop(10);
  const alice = new Clerk("alice", api);
  const bob = new Clerk("bob", api);
  alice.read(1);
  bob.read(1);
  assert.equal(alice.write(1, alice.seen - 3).status, 200);
  // Bob's write is based on v1, but the item is v2 now.
  assert.equal(bob.write(1, bob.seen - 2).status, 412);
  assert.deepEqual(db.read(1), { stock: 7, version: 2 }, "bob's stale write changed nothing");
  bob.read(1);
  assert.equal(bob.seen, 7);
  assert.equal(bob.write(1, bob.seen - 2).status, 200);
  assert.deepEqual(db.read(1), { stock: 5, version: 3 });
});

test("no If-Match: 428, and nothing is written", () => {
  const { db, api } = shop(10);
  const res = api.put(1, {}, { stock: 0 });
  assert.equal(res.status, 428);
  assert.deepEqual(db.read(1), { stock: 10, version: 1 });
});

test("conditional GET: If-None-Match with the current ETag gets 304 and no body", () => {
  const { api } = shop(10);
  const first = api.get(1, {});
  const again = api.get(1, { "If-None-Match": first.headers.ETag });
  assert.equal(again.status, 304);
  assert.equal(again.body, null);
  api.put(1, { "If-Match": first.headers.ETag }, { stock: 9 });
  const changed = api.get(1, { "If-None-Match": first.headers.ETag });
  assert.equal(changed.status, 200, "after a write the old ETag no longer matches");
  assert.equal(changed.headers.ETag, '"v2"');
});

test("broken: read-modify-write with last write wins loses alice's sale", () => {
  const db = new Db();
  db.rows.set(1, { stock: 10, version: 1 });
  const api = new LastWriteWinsApi(db);
  const alice = new Clerk("alice", api);
  const bob = new Clerk("bob", api);
  alice.read(1);
  bob.read(1);
  alice.write(1, alice.seen - 3);
  const res = bob.write(1, bob.seen - 2);
  assert.equal(res.status, 200, "both writes succeed");
  // 5 items were sold, but the stock says only 2 were.
  assert.equal(db.read(1).stock, 8);
});

test("broken: check, then write — both clerks pass the check and one sale is lost", () => {
  const db = new Db();
  db.rows.set(1, { stock: 10, version: 1 });
  const api = new CheckThenWriteApi(db);
  const ifMatch = { "If-Match": '"v1"' };
  // Both requests are checked before either is applied.
  assert.equal(api.check(1, ifMatch), true);
  assert.equal(api.check(1, ifMatch), true);
  api.apply(1, { stock: 7 });
  api.apply(1, { stock: 8 });
  assert.deepEqual(db.read(1), { stock: 8, version: 3 });
});
