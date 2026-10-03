/**
 * 07. Schema and Index Design
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: An orders table holds every order: who placed it, which day, its status and total.
 *   The API needs "this user's orders, newest first", "this user's orders in a date range" and
 *   "every order on one day". Each must read a handful of rows, not the whole table, and adding
 *   indexes for them must not make writes unaffordable.
 *
 * Approach: A composite index sorted by (user, day), and knowing exactly what it can answer
 *   An index is a sorted list of (key columns..., row id). Sorted by user, then by day within
 *   each user. A query can seek into it only through a leftmost prefix: equality on user, then
 *   optionally a range on day. Rows then come out in day order within the user, so ORDER BY
 *   day needs no sort. Columns listed in INCLUDE ride along in the index, so a query that only
 *   needs them never touches the table (a covering index). A query on day alone cannot seek,
 *   because day is sorted only inside each user, and falls back to a full scan.
 *
 * Cost: a seek is O(log n) plus one read per matching entry, plus one table lookup per match
 *   unless the index covers the query; a full scan reads every row. Every index adds one sorted
 *   insert (O(log n)) to every write.
 *
 * Pattern: composite B-tree index, leftmost prefix, covering index, index write amplification
 * Key insight: A composite index is a phone book sorted by last name, then first name. It finds
 *   "Smith, John" and every Smith, but it cannot find every John: they are spread across the
 *   whole book. Design indexes from the queries backwards: equality columns first, then the one
 *   range or sort column.
 * Tradeoffs: More indexes make more reads cheap and every write dearer, and each takes memory and
 *   disk. Wider covering indexes save table lookups but are bigger and must be updated whenever
 *   an included column changes. One range per index: after a range on the first column, the next
 *   column is only a filter, and its order is lost.
 * Staff notes: Read the query plan (EXPLAIN) for every hot query; a missing or unusable index is
 *   the most common cause of a slow endpoint. Put equality columns before range columns. Drop
 *   indexes nothing uses: they cost on every write. Some databases (Oracle, MySQL 8.0.13+,
 *   PostgreSQL 18+) can "skip scan" a composite index without its leading column, by probing
 *   once per distinct leading value; that helps only when the leading column has few values.
 * Interview signals: "this query is slow", "which index would you add", "composite index column
 *   order", "covering index", "why are writes slow", "EXPLAIN shows a sequential scan".
 * Real world: MySQL (InnoDB) and PostgreSQL B-tree indexes follow the leftmost-prefix rule
 *   described here. PostgreSQL 11+ and SQL Server support INCLUDE columns; in MySQL a secondary
 *   index covers a query when the index columns plus the primary key hold everything it needs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Col = "id" | "user" | "day" | "status" | "total";
export type Val = number | string;
export type Row = { id: number; user: number; day: number; status: string; total: number };
/** One index entry: the key columns in index order, the row id, and any INCLUDE columns. */
export type Entry = { key: Val[]; id: number; extra: Partial<Row> };
export type Query = {
  eq?: Partial<Row>;
  range?: { col: Col; from: number; to: number };
  orderBy?: Col;
  select: Col[];
};
/** What answering the last query cost, the way EXPLAIN ANALYZE reports it. */
export type Plan = {
  using: string;
  seekReads: number;
  entriesRead: number;
  rowLookups: number;
  rowsScanned: number;
  sorted: boolean;
};

export class Index {
  name: string;
  cols: Col[];
  include: Col[];
  // @why Sorted by the key columns in order: by user, then by day inside each user.
  entries: Entry[] = [];

  constructor(cols: Col[], include: Col[] = []) {
    this.cols = cols;
    this.include = include;
    this.name = `(${cols.join(", ")})${include.length ? ` INCLUDE (${include.join(", ")})` : ""}`;
  }

  /** Whether every column a query touches is in this index (the row id always is). */
  covers(cols: Col[]): boolean {
    for (const c of cols) {
      if (c !== "id" && !this.cols.includes(c) && !this.include.includes(c)) return false;
    }
    return true;
  }

  insert(row: Row) {
    const key = this.cols.map((c) => row[c]);
    const extra: Partial<Row> = {};
    for (const c of this.include) Object.assign(extra, { [c]: row[c] });
    // @why Keeping the list sorted is the price of a fast seek: every write finds its place, in every index.
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compare(this.entries[mid].key, key) <= 0) lo = mid + 1;
      else hi = mid;
    }
    this.entries.splice(lo, 0, { key, id: row.id, extra }); // @mark index-write
  }
}

export class Table {
  // @viz hide:key,extra values:lo,hi,mid,k,i
  // @why The table itself, by primary key. Reading a row here is a "lookup".
  rows = new Map<number, Row>();
  indexes: Index[];
  // @why Writes to storage: one for the row, one more for every index.
  writes = 0;
  plan: Plan = fresh("none");

  constructor(indexes: Index[]) {
    this.indexes = indexes;
  }

  insert(row: Row) {
    this.rows.set(row.id, row);
    this.writes++; // @mark table-write
    for (const index of this.indexes) {
      index.insert(row);
      this.writes++;
    }
    return this.writes; // @mark written
  }

  find(q: Query): Partial<Row>[] {
    const pick = this.choose(q);
    if (!pick) return this.scan(q);
    const { index, k, range } = pick;
    this.plan = fresh(index.name); // @mark use-index
    // @why The equality values for the leading k columns: the part of the key the seek can use.
    const prefix: Val[] = [];
    for (let i = 0; i < k; i++) prefix.push(q.eq![index.cols[i]]!);
    const start = range ? [...prefix, range.from] : prefix;
    // @why Seek: binary search for the first entry at or after the start key. About log2(n) reads.
    let lo = 0;
    let hi = index.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      this.plan.seekReads++;
      if (compare(index.entries[mid].key.slice(0, start.length), start) < 0) lo = mid + 1;
      else hi = mid;
    }
    // @why Covering: the index holds every column the query touches, so the table is never read.
    const covering = index.covers([...q.select, ...(Object.keys(q.eq ?? {}) as Col[]), ...(q.range ? [q.range.col] : []), ...(q.orderBy ? [q.orderBy] : [])]);
    const out: Partial<Row>[] = [];
    for (let i = lo; i < index.entries.length; i++) {
      const e = index.entries[i];
      this.plan.entriesRead++;
      // @why Walk while the entry still has the same prefix and is inside the range. The first one outside ends the walk.
      if (compare(e.key.slice(0, k), prefix) !== 0) break;
      if (range && (e.key[k] as number) > range.to) break; // @mark walk
      // @why Conditions on other index columns are checked on the entry, before paying for a lookup.
      const fromIndex = this.entryValues(index, e);
      if (!matches(fromIndex, q)) continue; // @mark filter
      if (covering) {
        out.push(fromIndex); // @mark covered
      } else {
        this.plan.rowLookups++;
        const row = this.rows.get(e.id)!; // @mark lookup
        if (matches(row, q)) out.push(row);
      }
    }
    // @why Entries come out in key order. That is ORDER BY's order only if it is the column right after the equality prefix.
    const ordered = !q.orderBy || q.orderBy === index.cols[k] || index.cols.slice(0, k).includes(q.orderBy);
    if (!ordered) this.sortBy(out, q.orderBy!);
    return project(out, q.select); // @mark answer
  }

  /** The planner, cut down: which index serves the most of this query through a leftmost prefix. */
  choose(q: Query): { index: Index; k: number; range?: Query["range"] } | null {
    let best: { index: Index; k: number; range?: Query["range"]; score: number } | null = null;
    for (const index of this.indexes) {
      // @why Count leading index columns with an equality condition. The count stops at the first column without one.
      let k = 0;
      while (k < index.cols.length && q.eq?.[index.cols[k]] !== undefined) k++;
      // @why After the equality prefix, one range on the very next column can still narrow the seek.
      const range = q.range && index.cols[k] === q.range.col ? q.range : undefined;
      const score = k + (range ? 0.5 : 0);
      if (score > 0 && (!best || score > best.score)) best = { index, k, range, score }; // @mark prefix
    }
    return best;
  }

  scan(q: Query): Partial<Row>[] {
    this.plan = fresh("table scan");
    const out: Partial<Row>[] = [];
    // @why No index can seek for this query, so every row in the table is read and tested.
    for (const row of this.rows.values()) {
      this.plan.rowsScanned++; // @mark full-scan
      if (matches(row, q)) out.push(row);
    }
    if (q.orderBy) this.sortBy(out, q.orderBy);
    return project(out, q.select); // @mark scanned
  }

  sortBy(rows: Partial<Row>[], col: Col) {
    // @why A sort the index could not save: O(m log m) over the matches, and nothing returns until it is done.
    this.plan.sorted = true; // @mark sort
    rows.sort((a, b) => compare([a[col]!, a.id!], [b[col]!, b.id!]));
  }

  entryValues(index: Index, e: Entry): Partial<Row> {
    const v: Partial<Row> = { id: e.id, ...e.extra };
    for (let i = 0; i < index.cols.length; i++) Object.assign(v, { [index.cols[i]]: e.key[i] });
    return v;
  }
}

// --- helpers for the scenarios ---

// Quiet: compare keys column by column, like a B-tree compares composite keys.
function compare(a: Val[], b: Val[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

// Quiet: does a row (or the part of it an index entry holds) meet the query's conditions?
// A column the partial row lacks is not checked here; it is checked once the full row is read.
function matches(row: Partial<Row>, q: Query): boolean {
  for (const [c, v] of Object.entries(q.eq ?? {})) {
    const have = row[c as Col];
    if (have !== undefined && have !== v) return false;
  }
  if (q.range) {
    const have = row[q.range.col] as number | undefined;
    if (have !== undefined && (have < q.range.from || have > q.range.to)) return false;
  }
  return true;
}

function project(rows: Partial<Row>[], cols: Col[]): Partial<Row>[] {
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])) as Partial<Row>);
}

function fresh(using: string): Plan {
  return { using, seekReads: 0, entriesRead: 0, rowLookups: 0, rowsScanned: 0, sorted: false };
}

// Quiet: 6 users ordering every day for 6 days: 36 orders, inserted in the order they were placed (day by day).
function orders(...indexes: Index[]): Table {
  const t = new Table(indexes);
  let id = 1;
  for (let day = 1; day <= 6; day++) {
    for (let user = 1; user <= 6; user++) {
      t.insert({ id, user, day, status: id % 3 === 0 ? "refunded" : "paid", total: ((id * 7) % 50) + 10 });
      id++;
    }
  }
  return t;
}

test("index (user, day): user = 4 seeks to that user, reads 6 orders, already in day order", () => {
  const t = orders(new Index(["user", "day"]));
  const rows = t.find({ eq: { user: 4 }, orderBy: "day", select: ["day", "total"] });
  assert.deepEqual(
    rows.map((r) => r.day),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(t.plan.using, "(user, day)");
  assert.equal(t.plan.seekReads, 5, "log2(36) is about 5");
  // Six matches, plus the first entry of user 5, which ends the walk.
  assert.equal(t.plan.entriesRead, 7);
  assert.equal(t.plan.rowLookups, 6, "total is not in the index, so each match reads its row");
  assert.equal(t.plan.rowsScanned, 0);
  assert.equal(t.plan.sorted, false);
});

test("index (user, day): user = 4 and day 2..4 seeks to (4, 2) and stops after (4, 4)", () => {
  const t = orders(new Index(["user", "day"]));
  const rows = t.find({ eq: { user: 4 }, range: { col: "day", from: 2, to: 4 }, select: ["day", "total"] });
  assert.deepEqual(
    rows.map((r) => r.day),
    [2, 3, 4],
  );
  assert.equal(t.plan.entriesRead, 4);
  assert.equal(t.plan.rowLookups, 3);
});

test("index (user, day): a range on user leaves day unordered, so ORDER BY day must sort", () => {
  const t = orders(new Index(["user", "day"]));
  const rows = t.find({ range: { col: "user", from: 2, to: 3 }, orderBy: "day", select: ["user", "day"] });
  // The index gives user 2's days 1-6, then user 3's days 1-6: sorted by day only within each user.
  assert.deepEqual(
    rows.map((r) => r.day),
    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  );
  assert.equal(t.plan.sorted, true);
  assert.equal(t.plan.entriesRead, 13);
});

test("index (user, day): with a range on user, day = 5 is only a filter on each entry", () => {
  const t = orders(new Index(["user", "day"]));
  const rows = t.find({ eq: { day: 5 }, range: { col: "user", from: 2, to: 3 }, select: ["user", "total"] });
  assert.deepEqual(
    rows.map((r) => r.user),
    [2, 3],
  );
  // The seek narrows to users 2-3 (12 entries, plus the one that ends the walk); day is tested on each.
  assert.equal(t.plan.entriesRead, 13);
  assert.equal(t.plan.rowLookups, 2, "only the two entries with day 5 cost a lookup");
});

test("covering: (user, day) INCLUDE (total) answers from the index without touching the table", () => {
  const t = orders(new Index(["user", "day"], ["total"]));
  const rows = t.find({ eq: { user: 4 }, select: ["day", "total"] });
  assert.equal(rows.length, 6);
  assert.equal(t.plan.using, "(user, day) INCLUDE (total)");
  assert.equal(t.plan.rowLookups, 0);
});

test("writes: every index is one more sorted insert on every write", () => {
  const one = orders(new Index(["user", "day"]));
  const three = orders(new Index(["user", "day"]), new Index(["day"]), new Index(["status"]));
  assert.equal(one.writes, 36 * 2);
  assert.equal(three.writes, 36 * 4);
  const before = three.writes;
  three.insert({ id: 37, user: 1, day: 7, status: "paid", total: 20 });
  assert.equal(three.writes - before, 4, "one order: the row and three index entries");
});

test("index (day): a second index serves day = 5 with a seek", () => {
  const t = orders(new Index(["user", "day"]), new Index(["day"]));
  const rows = t.find({ eq: { day: 5 }, select: ["user", "total"] });
  assert.equal(rows.length, 6);
  assert.equal(t.plan.using, "(day)");
  assert.equal(t.plan.entriesRead, 7);
  assert.equal(t.plan.rowsScanned, 0);
});

test("broken: day = 5 cannot use (user, day) and reads all 36 rows to return 6", () => {
  const t = orders(new Index(["user", "day"]));
  const rows = t.find({ eq: { day: 5 }, select: ["user", "total"] });
  assert.equal(rows.length, 6);
  assert.equal(t.plan.using, "table scan");
  assert.equal(t.plan.rowsScanned, 36);
});
