/**
 * 04. Storage Engines
 * Level: Senior
 * Group: Flashcards
 *
 * What happens under a database's write and read: the write-ahead log that makes a write
 * durable, the LSM tree and the B+ tree that organise data on disk, and the Merkle tree that
 * lets two replicas find what differs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const WAL = "sd-03-storage/008-write-ahead-log";
const LSM = "sd-03-storage/009-lsm-tree";
const BTREE = "sd-03-storage/010-b-plus-tree";
const MERKLE = "sd-03-storage/011-merkle-tree";

export const deck = flashcards("Storage engines", [
  {
    front: "When may a database tell a client its write is done?",
    back: "Only after the write's log record is **durable**: written and fsynced. Acknowledge from memory first, and a crash loses a write the client was told was saved.",
    link: WAL,
  },
  {
    front: "A crash cuts the last log record in half. What does recovery do?",
    back: "Its **checksum** fails, so recovery drops it and stops there. That is safe: its fsync never finished, so it was never acknowledged.",
    link: WAL,
  },
  {
    front: "A checkpoint writes a snapshot and truncates the log. In which order, and why?",
    back: "**Snapshot durable first, then cut the log.** Until the snapshot is on disk, the log is the only durable copy of those writes; cut it first and a crash in between loses them.",
    link: WAL,
  },
  {
    front: "What is group commit, and what does it trade?",
    back: "Writes that arrive while one fsync is running are made durable **together** by the next one. Each write waits a little longer; throughput rises a lot, because one fsync (tens of µs to milliseconds) otherwise caps writes a second.",
    link: WAL,
  },
  {
    front: "The server crashes after the fsync but before the acknowledgement. What does the client know?",
    back: "Nothing: the write **survived**, but the client never heard back. If it retries, the write happens twice unless the operation is idempotent. Durability does not remove the unknown outcome.",
    link: WAL,
  },
  {
    front: "How does checkpoint frequency affect a restart?",
    back: "Recovery replays everything since the last checkpoint. Checkpoint rarely and **restarts are slow** and the log grows; checkpoint often and you pay the snapshot's I/O more often.",
    link: WAL,
  },
  {
    front: "How does a log-structured merge (LSM) tree take a write?",
    back: "Append it to the **log** for durability and put it in an in-memory sorted table (**memtable**). When the memtable is full it is flushed as an immutable sorted file (SSTable). Writes only ever go to disk sequentially.",
    link: LSM,
  },
  {
    front: "How does an LSM tree find the latest value of a key?",
    back: "Newest place first: memtable, then level-0 files newest first, then lower levels. The **first hit wins**, because a newer write always sits in a newer place. A Bloom filter per file skips most files that lack the key.",
    link: LSM,
  },
  {
    front: "Files in an LSM tree are never changed. So how is a key deleted?",
    back: "By writing a **tombstone**, a newer entry that hides older values. Compaction may drop the tombstone only when no older value can remain below it (in practice, at the **bottom level**), and in a replicated store only after every replica has seen it; drop it earlier and an older value comes back.",
    link: LSM,
  },
  {
    front: "Read, write and space amplification: what are they in an LSM tree?",
    back: "**Read**: one lookup checks several files. **Write**: each entry is rewritten every time compaction merges it. **Space**: old versions and tombstones take disk until compacted away.",
    link: LSM,
  },
  {
    front: "Leveled or tiered compaction?",
    back: "**Leveled** keeps each level's files from overlapping: cheap reads, little wasted space, more rewriting. **Tiered** merges files of similar size: less rewriting, more files per read. Write-heavy workloads lean tiered, read-heavy ones leveled.",
    link: LSM,
  },
  {
    front: "An LSM-based database suddenly slows or blocks writes under heavy load. What is happening?",
    back: "A **write stall**: writes arrive faster than compaction can merge, level 0 piles up, and the engine throttles incoming writes until compaction catches up. Watch the level-0 file count and pending compaction bytes.",
    link: LSM,
  },
  {
    front: "Why can a queue-like workload (insert, then delete soon after) be slow on an LSM store?",
    back: "Every delete leaves a **tombstone**, and range scans must step over all of them until compaction clears them.",
    link: LSM,
  },
  {
    front: "How many page reads does a B+ tree lookup take?",
    back: "**One per level**, root to leaf; every leaf is at the same depth. Height is about log base F of N, where F is the fan-out. With a fan-out in the hundreds, three or four levels hold billions of keys.",
    link: BTREE,
  },
  {
    front: "Why are a B+ tree's leaves linked to each other?",
    back: "So a **range scan** descends once, to the first key, then follows the links. Without them, every next leaf would cost a fresh walk from the root.",
    link: BTREE,
  },
  {
    front: "Random UUIDs or ever-increasing ids as a B+ tree primary key?",
    back: "**Increasing** keys always insert into the rightmost leaf: dense pages, but one crowded page under many concurrent inserts. **Random** keys spread inserts over every leaf: more splits and more pages that must be in memory.",
    link: BTREE,
  },
  {
    front: "What is a clustered index?",
    back: "The table's **rows live in the leaves** of the primary-key tree, as in MySQL's InnoDB. Other indexes then store the primary key, so a lookup through them walks two trees.",
    link: BTREE,
  },
  {
    front: "Why leave free space in B+ tree pages (a fill factor below 100%)?",
    back: "Later inserts land in the free space **without splitting** the page at once. The price is more pages, so more disk and memory for the same data.",
    link: BTREE,
  },
  {
    front: "LSM tree or B+ tree: how do you choose?",
    back: "LSM: **faster writes** and more compact storage, at the cost of compaction work and reads that may check several files. B+ tree: **faster, more predictable reads**, because each key has exactly one place, at the cost of rewriting whole pages on writes.",
    link: BTREE,
  },
  {
    front: "Two replicas hold a million buckets each and one differs. How does a Merkle tree find it?",
    back: "Compare roots; where fingerprints differ, compare the two children; follow only the differing side. About **two comparisons per level**, so ~41 for one bucket in a million, instead of a million with a flat list.",
    link: MERKLE,
  },
  {
    front: "When does a Merkle tree stop paying off?",
    back: "When **most buckets differ**: it compares almost every node, more than a flat list. It also costs a rehash up the tree on every write (or a full read to rebuild it), and repair resends whole buckets.",
    link: MERKLE,
  },
  {
    front: "Why is anti-entropy repair in a Dynamo-style store run on a schedule, a range at a time?",
    back: "Building the trees means **reading the data**, which competes with normal traffic. Each node keeps one tree per key range it owns and compares it only with replicas of that range.",
    link: MERKLE,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
  assert.deepEqual([...new Set(deck.cards.map((c) => c.link))].sort(), [WAL, LSM, BTREE, MERKLE].sort());
});

test("the arithmetic on the cards", () => {
  // Fan-out in the hundreds: 3 levels of 1,000 or 4 levels of 200 hold billions.
  assert.ok(1000 ** 3 >= 1e9 && 200 ** 4 >= 1e9);
  // Merkle: root plus two per level below it, for one differing bucket.
  const compares = (buckets: number) => 1 + 2 * Math.log2(buckets);
  assert.equal(compares(8), 7);
  assert.equal(compares(1024), 21);
  assert.equal(compares(2 ** 20), 41);
});
