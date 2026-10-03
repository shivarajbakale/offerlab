/**
 * 009. LSM Tree
 * Level: Staff
 * Group: Storage
 *
 * Problem: Take a high rate of writes into a sorted on-disk index. Keeping one sorted file
 *   and inserting each write into its place means jumping around the disk and rewriting the
 *   file, which is slow.
 *
 * Approach: Memtable, immutable sorted tables and compaction
 *   Writes go into a small sorted table in memory, the memtable (kept safe from crashes by a
 *   write-ahead log, 008). When it is full it is written to disk in one sequential pass as a
 *   sorted table that is never changed again (an SSTable), in level 0. A delete writes a
 *   tombstone. A read checks the memtable, then level-0 tables newest first, then the one
 *   level-1 table whose key range covers the key, and stops at the first hit. When level 0 has
 *   too many tables, compaction merges them with level 1 into new tables that do not overlap,
 *   keeping only the newest version of each key and dropping tombstones at the bottom level.
 *
 * Cost: put: an insert into the in-memory memtable, no disk seek; flush: one sequential write
 *   of the memtable; get: up to 1 + (tables in L0) + 1 table searches (read amplification);
 *   compaction: every entry is rewritten each time it is merged (write amplification).
 *
 * Pattern: storage engine
 * Key insight: Turn random writes into sequential ones: collect and sort them in memory, write
 *   them out in one pass, and never modify a file once written. The bill comes later and in the
 *   background: a key can be in several tables, so reads look in several places, and
 *   compaction rewrites data to keep that number small.
 * Tradeoffs: Very high write throughput and compact files, but reads cost more than in a B+
 *   tree (010), because a key may be in several tables; a Bloom filter per table (005) lets a
 *   read skip tables that cannot hold the key. Compaction uses disk bandwidth and can fall
 *   behind under heavy writes. Deleted data takes space until compaction removes it.
 * Staff notes: Leveled compaction (each level about ten times bigger, tables in a level do not
 *   overlap) keeps reads and space cheap at the cost of more rewriting; tiered compaction
 *   (merge tables of similar size) rewrites less but leaves more tables to check. When writes
 *   outpace compaction, level 0 fills up and the engine slows or stops writes until it catches
 *   up (a write stall). Delete-heavy workloads leave piles of tombstones that slow range scans.
 *   Tune memtable size, the level-0 trigger and the level size ratio together.
 * Interview signals: "write-heavy", "time series", "ingest millions of events per second",
 *   "append-only", "SSTable", "compaction", "why are reads slower than writes".
 * Real world: LevelDB and RocksDB are LSM-tree storage engines, and RocksDB sits under many
 *   other databases. Apache Cassandra and HBase store data as SSTables or similar sorted files
 *   with compaction, following Google's Bigtable paper (2006). The design comes from O'Neil et
 *   al., "The Log-Structured Merge-Tree" (1996).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** A key and its value; a null value is a tombstone. */
export type Entry = [string, string | null];
export type SSTable = { id: string; entries: Entry[] };

// @why Tables in level 1 are cut to at most this many entries, so each covers a narrow key range and a read opens just one.
const TABLE_SIZE = 4;

export class LsmTree {
  // @viz levels:memtable,levels,hot=checked
  // @why Writes land here first, in memory, kept sorted. A write costs no disk seek at all. (A write-ahead log, lesson 008, keeps them safe from a crash.)
  memtable: Entry[] = [];
  // @why levels[0] holds flushed memtables, newest first; their key ranges overlap. levels[1] holds merged tables whose ranges do not overlap.
  levels: SSTable[][] = [[], []];
  // @why The places the last read looked, in order: the read cost the view highlights.
  checked: string[] = [];
  nextId = 1;
  memLimit: number;
  l0Limit: number;

  constructor(memLimit = 4, l0Limit = 3) {
    this.memLimit = memLimit;
    this.l0Limit = l0Limit;
  }

  put(k: string, v: string) {
    this.write(k, v);
  }

  // @why A delete cannot reach into the older tables on disk, which are never changed. It writes a tombstone that hides the old value instead.
  delete(k: string) {
    this.write(k, null); // @mark tombstone
  }

  write(k: string, v: string | null) {
    this.checked = [];
    let i = 0;
    while (i < this.memtable.length && this.memtable[i][0] < k) i++;
    if (this.memtable[i]?.[0] === k) this.memtable[i] = [k, v];
    else this.memtable.splice(i, 0, [k, v]); // @mark insert
    if (this.memtable.length >= this.memLimit) this.flush();
  }

  // @why A full memtable is written out in one sequential pass as a new table. Tables are never changed after this, so writing one needs no seeks.
  flush() {
    const table: SSTable = { id: `T${this.nextId++}`, entries: this.memtable };
    this.levels[0].unshift(table); // @mark flush
    this.memtable = [];
    if (this.levels[0].length >= this.l0Limit) this.compact();
  }

  get(k: string): string | undefined {
    this.checked = ["memtable"];
    const mem = this.find(this.memtable, k);
    if (mem) return mem[1] ?? undefined; // @mark hit-mem
    // @why Newest first: the first table that has the key holds its latest value, so the read can stop there.
    for (const table of this.levels[0]) {
      this.checked.push(table.id); // @mark check-l0
      const e = this.find(table.entries, k);
      if (e) return e[1] ?? undefined; // @mark hit-l0
    }
    // @why Level-1 tables do not overlap, so at most one of them can hold the key.
    const table = this.levels[1].find((t) => t.entries[0][0] <= k && k <= t.entries.at(-1)![0]);
    if (!table) return undefined; // @mark miss
    this.checked.push(table.id); // @mark check-l1
    const e = this.find(table.entries, k); // @mark search-l1
    return e?.[1] ?? undefined;
  }

  // @why Each table is sorted, so a binary search finds a key in a few probes.
  find(entries: Entry[], k: string): Entry | undefined {
    let lo = 0;
    let hi = entries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid][0] === k) return entries[mid];
      if (entries[mid][0] < k) lo = mid + 1;
      else hi = mid - 1;
    }
    return undefined;
  }

  // @why Merging keeps reads short: many overlapping tables become a few non-overlapping ones, and old versions of a key stop taking space.
  compact() {
    const newest = new Map<string, string | null>();
    // @why Visit tables from newest to oldest and keep the first value seen for each key: that is the latest write.
    for (const table of [...this.levels[0], ...this.levels[1]]) {
      for (const [k, v] of table.entries) if (!newest.has(k)) newest.set(k, v);
    }
    const merged: Entry[] = [...newest].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    // @why Level 1 is the bottom: no older value lies below it, so a tombstone has nothing left to hide and can go.
    const kept = merged.filter(([, v]) => v !== null); // @mark drop-tombstones
    const out: SSTable[] = [];
    for (let i = 0; i < kept.length; i += TABLE_SIZE) out.push({ id: `T${this.nextId++}`, entries: kept.slice(i, i + TABLE_SIZE) });
    this.levels = [[], out]; // @mark compacted
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: drops tombstones as soon as the memtable is flushed, not at the bottom level.
export class EarlyTombstoneDrop extends LsmTree {
  flush() {
    this.memtable = this.memtable.filter(([, v]) => v !== null); // @mark early-drop
    super.flush();
  }
}

// Broken on purpose: searches level 0 from the oldest table to the newest.
export class OldestFirstRead extends LsmTree {
  get(k: string): string | undefined {
    this.checked = ["memtable"];
    for (const table of [...this.levels[0]].reverse()) {
      this.checked.push(table.id); // @mark oldest-first
      const e = this.find(table.entries, k);
      if (e) return e[1] ?? undefined; // @mark stale-hit
    }
    return undefined;
  }
}

// Broken on purpose: one sorted file on disk, with every write put into its place.
export class SortedFileStore {
  // @viz levels:file
  file: Entry[] = [];
  // How many entries had to be rewritten to make room, over all writes.
  moved = 0;

  put(k: string, v: string) {
    let i = 0;
    while (i < this.file.length && this.file[i][0] < k) i++;
    if (this.file[i]?.[0] === k) {
      this.file[i] = [k, v];
      return;
    }
    // Everything after the new key's place moves one slot along, and is written again.
    this.file.push(["_", "_"]);
    for (let j = this.file.length - 1; j > i; j--) {
      this.file[j] = this.file[j - 1]; // @mark shift
      this.moved++;
    }
    this.file[i] = [k, v]; // @mark placed
  }
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Average entries moved per write, for `n` writes of random keys. */
function movesPerWrite(store: SortedFileStore, n: number, seed: number): number {
  const rand = mulberry32(seed);
  const start = store.moved;
  for (let i = 0; i < n; i++) store.put(`k${String(Math.floor(rand() * 1e6)).padStart(6, "0")}`, "v");
  return (store.moved - start) / n;
}

function load(tree: LsmTree, pairs: [string, string][]) {
  for (const [k, v] of pairs) tree.put(k, v);
}

const keys = (t: SSTable) => t.entries.map(([k]) => k);

test("write: goes to the memtable", () => {
  const tree = new LsmTree();
  tree.put("m", "1");
  tree.put("c", "2");
  assert.deepEqual(tree.memtable, [
    ["c", "2"],
    ["m", "1"],
  ]);
  assert.equal(tree.levels[0].length, 0, "nothing on disk yet");
});

test("flush: a full memtable becomes an immutable sorted table", () => {
  const tree = new LsmTree();
  load(tree, [
    ["m", "1"],
    ["c", "2"],
    ["x", "3"],
  ]);
  tree.put("a", "4");
  assert.equal(tree.memtable.length, 0);
  assert.equal(tree.levels[0].length, 1);
  assert.deepEqual(keys(tree.levels[0][0]), ["a", "c", "m", "x"]);
});

test("read path: newest first, stop at the first hit", () => {
  const tree = new LsmTree();
  load(tree, [["a", "old"], ["b", "1"], ["c", "1"], ["d", "1"]]);
  load(tree, [["a", "new"], ["e", "1"], ["f", "1"], ["g", "1"]]);
  tree.put("z", "1");
  assert.equal(tree.get("a"), "new");
  assert.deepEqual(tree.checked, ["memtable", "T2"], "the older table T1 is never read");
});

test("delete: a tombstone hides older values", () => {
  const tree = new LsmTree();
  load(tree, [["a", "1"], ["b", "1"], ["c", "1"], ["d", "1"]]);
  tree.delete("a");
  assert.deepEqual(tree.memtable, [["a", null]]);
  assert.equal(tree.get("a"), undefined);
  assert.deepEqual(tree.checked, ["memtable"], "the tombstone answers before T1 is read");
});

test("compaction: merge keeps the newest and drops shadowed values", () => {
  const tree = new LsmTree();
  load(tree, [["a", "1"], ["b", "1"], ["c", "1"], ["d", "1"]]);
  load(tree, [["a", "2"], ["b", "2"], ["e", "1"], ["f", "1"]]);
  load(tree, [["a", "3"], ["c", "2"], ["e", "2"]]);
  tree.delete("d");
  assert.equal(tree.levels[0].length, 0, "L0 was merged away");
  const l1 = tree.levels[1].flatMap((t) => t.entries);
  assert.deepEqual(l1, [
    ["a", "3"],
    ["b", "2"],
    ["c", "2"],
    ["e", "2"],
    ["f", "1"],
  ]);
  // 12 entries went in (counting the tombstone); 5 live keys come out.
  assert.equal(l1.length, 5);
  assert.deepEqual(
    tree.levels[1].map((t) => t.entries.length),
    [4, 1],
  );
  assert.equal(tree.get("d"), undefined);
});

test("broken: one sorted file — every write shifts the keys after it", () => {
  const store = new SortedFileStore();
  for (const k of ["b", "d", "f", "h", "j", "l"]) store.put(k, "1");
  store.put("c", "2");
  store.put("a", "2");
  assert.equal(store.moved, 5 + 7, "c moved 5 entries, a moved all 7");
  const small = movesPerWrite(store, 100, 1);
  const large = movesPerWrite(store, 400, 2);
  assert.ok(small > 20, `first 100 writes: ${small} moves each`);
  assert.ok(large > 100, `next 400 writes: ${large} moves each; the cost grows with the file`);
});

test("broken: drop tombstones too early — a deleted value comes back", () => {
  const tree = new EarlyTombstoneDrop();
  load(tree, [["a", "1"], ["b", "1"], ["c", "1"], ["d", "1"]]);
  load(tree, [["e", "1"], ["f", "1"], ["g", "1"], ["h", "1"]]);
  load(tree, [["i", "1"], ["j", "1"], ["k", "1"], ["l", "1"]]);
  tree.delete("a");
  assert.equal(tree.get("a"), undefined, "right after the delete, a is gone");
  load(tree, [["m", "1"], ["n", "1"]]);
  tree.put("o", "1");
  assert.equal(tree.get("a"), "1", "a is back");
});

test("broken: read oldest first — returns a stale value", () => {
  const tree = new OldestFirstRead();
  load(tree, [["a", "old"], ["b", "1"], ["c", "1"], ["d", "1"]]);
  load(tree, [["a", "new"], ["e", "1"], ["f", "1"], ["g", "1"]]);
  assert.equal(tree.get("a"), "old");
  assert.deepEqual(tree.checked, ["memtable", "T1"]);
});
