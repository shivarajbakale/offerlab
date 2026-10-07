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
  // @viz levels:memtable,levels,hot=checked,memory=memtable,disk=levels,title.memtable=Memtable_(sorted),title.L0=Level_0_(newest_first;_ranges_overlap),title.L1=Level_1_(merged;_no_overlaps)
  // @viz hide:forgot,nextId,memLimit,l0Limit,k,v,i,lo,hi,mid,mem,e,table,newest,merged,kept,out,moved,j
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
    // @caption {memtable[i] && memtable[i][0] === k ? (v === null ? k + " is already in the memtable, so it is replaced there by a tombstone " + k + "=†." : k + " is already in the memtable, so its value is replaced there: " + k + "=" + v + ".") : (v === null ? "Delete " + k + "." : "Write " + k + "=" + v + ".")}
    if (this.memtable[i]?.[0] === k) this.memtable[i] = [k, v];
    // @caption {v === null ? "Delete " + k + ": its old value sits in tables on disk, which are never changed. So a tombstone, " + k + "=† (meaning deleted), goes into the memtable instead, to hide the old value." : k + "=" + v + " goes into the memtable, a small sorted table in memory, in key order. No disk is touched, so the write is very fast."} The memtable holds {memtable.length} of {memLimit} entries.
    else this.memtable.splice(i, 0, [k, v]); // @mark insert
    if (this.memtable.length >= this.memLimit) this.flush();
  }

  // @why A full memtable is written out in one sequential pass as a new table. Tables are never changed after this, so writing one needs no seeks.
  flush() {
    const table: SSTable = { id: `T${this.nextId++}`, entries: this.memtable };
    // @caption The memtable has reached its limit, so its {table.entries.length} entries are written to disk in one go, as table {table.id} at the front of level 0 (newest first). That is one long sequential write, the fastest kind, and {table.id} will never be changed again. The memtable starts over empty.
    this.levels[0].unshift(table); // @mark flush
    this.memtable = [];
    if (this.levels[0].length >= this.l0Limit) this.compact();
  }

  get(k: string): string | undefined {
    // @caption Read {k}. The newest data is in the memtable, so the read looks there first (the numbers show the order it checks places in).
    this.checked = ["memtable"];
    const mem = this.find(this.memtable, k);
    // @caption {mem ? (mem[1] === null ? "good: The memtable holds a tombstone for " + k + ": it was deleted. The read stops here and answers \"not found\", without opening the older tables that still hold its old value." : "good: Found " + k + "=" + mem[1] + " in the memtable, the newest place. No disk read needed.") : "No " + k + " in the memtable. Next: the tables on disk, newest first."}
    if (mem) return mem[1] ?? undefined; // @mark hit-mem
    // @why Newest first: the first table that has the key holds its latest value, so the read can stop there.
    for (const table of this.levels[0]) {
      // @caption Open table {table.id} in level 0, a disk read (place {checked.length} this read has checked).
      this.checked.push(table.id); // @mark check-l0
      const e = this.find(table.entries, k);
      // @caption {e ? (e[1] === null ? "good: " + table.id + " holds a tombstone for " + k + ": deleted. The read stops with \"not found\"." : "good: " + table.id + " has " + k + "=" + e[1] + ". It is the newest table holding " + k + ", so this is the latest value. The read stops, and older tables are never opened.") : table.id + " has no " + k + ". Try the next older table."}
      if (e) return e[1] ?? undefined; // @mark hit-l0
    }
    // @why Level-1 tables do not overlap, so at most one of them can hold the key.
    // @caption {table ? "Not in level 0 either. Level 1 tables do not overlap, so only one of them can hold " + k + ": " + table.id + ", which covers " + table.entries[0][0] + " to " + table.entries[table.entries.length - 1][0] + "." : "Not in level 0, and no level 1 table covers " + k + ". The key is not stored anywhere: \"not found\"."}
    const table = this.levels[1].find((t) => t.entries[0][0] <= k && k <= t.entries.at(-1)![0]);
    if (!table) return undefined; // @mark miss
    this.checked.push(table.id); // @mark check-l1
    // @caption {table.entries.some((x) => x[0] === k && x[1] !== null) ? (self.forgot && self.forgot.includes(k) ? "bad: The read finds " + k + "=" + table.entries.find((x) => x[0] === k)[1] + " in " + table.id + ". But " + k + " was deleted! Its tombstone was thrown away at the flush, so nothing hides this old value any more: deleted data has come back." : "good: Found " + k + "=" + table.entries.find((x) => x[0] === k)[1] + " in " + table.id + ", after checking " + checked.length + " places.") : "good: " + k + " is not in " + table.id + ", the only table that could hold it, so the answer is \"not found\" (" + checked.length + " places checked)."}
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
    // @caption Level 0 now has {levels[0].length} tables, the limit, and their key ranges overlap, so a read may have to open all of them. Compaction merges them with level 1: {levels[0].concat(levels[1]).reduce((n, t) => n + t.entries.length, 0)} entries go in, and for each key only the newest version is kept: {newest.size} keys.
    const merged: Entry[] = [...newest].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    // @why Level 1 is the bottom: no older value lies below it, so a tombstone has nothing left to hide and can go.
    const kept = merged.filter(([, v]) => v !== null); // @mark drop-tombstones
    const out: SSTable[] = [];
    for (let i = 0; i < kept.length; i += TABLE_SIZE) out.push({ id: `T${this.nextId++}`, entries: kept.slice(i, i + TABLE_SIZE) });
    // @caption good: Compaction done. Level 0 is empty, and level 1 holds {out.length === 1 ? "1 table" : out.length + " tables"} with no overlapping key ranges and one version per key. {merged.length > kept.length ? "Level 1 is the bottom level, so a tombstone has nothing older left to hide: " + (merged.length - kept.length === 1 ? "the tombstone was" : (merged.length - kept.length) + " tombstones were") + " dropped, and the deleted key is gone for good. " : ""}A read now checks the memtable and at most one table on disk.
    this.levels = [[], out]; // @mark compacted
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: drops tombstones as soon as the memtable is flushed, not at the bottom level.
export class EarlyTombstoneDrop extends LsmTree {
  // For the picture only: the keys whose tombstones this store threw away.
  forgot: string[] = [];

  flush() {
    this.forgot.push(...this.memtable.filter(([, v]) => v === null).map(([k]) => k));
    // @caption {memtable.length < memLimit ? "bad: This flush throws away the tombstone for " + forgot.join(", ") + " before writing the table. But level 1 below still holds the old value, and now nothing will hide it." : "This store drops tombstones at every flush, too early. This memtable has none, so nothing goes wrong yet."}
    this.memtable = this.memtable.filter(([, v]) => v !== null); // @mark early-drop
    super.flush();
  }
}

// Broken on purpose: searches level 0 from the oldest table to the newest.
export class OldestFirstRead extends LsmTree {
  get(k: string): string | undefined {
    this.checked = ["memtable"];
    for (const table of [...this.levels[0]].reverse()) {
      // @caption This read checks level 0 from the OLDEST table to the newest. It opens {table.id} first.
      this.checked.push(table.id); // @mark oldest-first
      const e = this.find(table.entries, k);
      // @caption {e ? "bad: " + table.id + " has " + k + "=" + e[1] + ", and the read stops there. But " + table.id + " is the oldest table: a newer table holds a later write of " + k + ", so this answer is stale." : table.id + " has no " + k + ". On to the next table."}
      if (e) return e[1] ?? undefined; // @mark stale-hit
    }
    return undefined;
  }
}

// Broken on purpose: one sorted file on disk, with every write put into its place.
export class SortedFileStore {
  // @viz levels:file,disk=file,title.file=One_sorted_file_on_disk
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
      // @caption bad: To make room for {k}, the entry {file[j][0]} is moved one slot along and written to disk again (move {moved + 1} so far, over all writes).
      this.file[j] = this.file[j - 1]; // @mark shift
      this.moved++;
    }
    // @caption {file.length - 1 - i > 0 ? "bad: " + k + " is in place, but only after the " + (file.length - 1 - i) + " entries after it were each moved and written again. The bigger the file, the more every write moves." : k + " sorts after every key in the file, so it goes at the end and nothing moves. That is the lucky case."}
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
