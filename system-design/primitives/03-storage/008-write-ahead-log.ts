/**
 * 008. Write-Ahead Log
 * Level: Senior
 * Group: Storage
 *
 * Problem: Keep a key-value store in memory for speed, but never lose a write the client was
 *   told succeeded. Memory is wiped when the machine crashes, and rewriting a data file in
 *   place on every write is slow and can leave the file half-updated.
 *
 * Approach: Log first, then memory
 *   Every write is first appended to the end of a log file as a record with a sequence number
 *   and a checksum. The log is forced to disk (fsync), and only then is the write applied to
 *   memory and acknowledged. After a crash, recovery replays the log from the start to rebuild
 *   memory, and stops at the first record whose checksum does not match: that is a record the
 *   crash cut in half. A checkpoint writes a snapshot of memory to disk, forces it to disk,
 *   and only then truncates the log, so recovery starts from the snapshot and replays only
 *   what came after.
 *
 * Cost: one sequential append plus one fsync per write (or per batch, with group commit);
 *   recovery time grows with the log since the last checkpoint; a checkpoint writes all of
 *   memory once.
 *
 * Pattern: durability
 * Key insight: Appending to the end of a file is the cheapest write a disk can do, and an
 *   append that has been forced to disk survives a crash. So make the log the truth and treat
 *   memory as a cache rebuilt from it. The acknowledgement must come after the fsync, never
 *   before.
 * Tradeoffs: An fsync costs from tens of microseconds to milliseconds, depending on the device,
 *   so per-write fsync caps write throughput; batching many writes into one fsync (group
 *   commit) raises throughput but makes each write wait for its batch. Longer gaps between
 *   checkpoints mean cheaper normal operation but slower recovery.
 * Staff notes: Group commit is how databases make fsync affordable. The same log is the unit of
 *   replication: shipping log records to a follower and replaying them there (log shipping) is
 *   how many databases build replicas. Disks and filesystems can reorder or lie about writes,
 *   so production logs also checksum every record and test on real crashes. The order of a
 *   checkpoint matters: the snapshot must be durable before the log it replaces is deleted.
 * Interview signals: "durability", "crash recovery", "what happens if the server dies mid-write",
 *   "fsync", "acknowledged writes", "redo log", "replication log".
 * Real world: PostgreSQL writes changes to its WAL before changing data files, and replays it
 *   after a crash; its streaming replication ships the same WAL to replicas. Most databases and
 *   storage engines keep a redo log of this kind, for example MySQL's InnoDB redo log and the
 *   write-ahead log in front of LevelDB and RocksDB memtables.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type LogRecord = { seq: number; k: string; v: string; checksum: number };

// @why A checksum is a short fingerprint of a record. A record that a crash cut in half no longer matches its fingerprint, so recovery can tell it apart from a whole one.
function checksum(seq: number, k: string, v: string): number {
  let h = 0x811c9dc5;
  const s = `${seq}|${k}|${v}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export class WalStore {
  // @viz levels:memory,log@durable,snapshot,snapshotInBuffer,hot=rec
  // @why Memory is fast but wiped by a crash. It is only a copy of what the log and snapshot say.
  memory = new Map<string, string>();
  // @why The log file. Records before `durable` are on disk; the rest are still in the OS buffer and die with the machine.
  log: LogRecord[] = [];
  // @why How many log records have reached disk. Only these survive a crash.
  durable = 0;
  // @why A copy of memory saved on disk by a checkpoint. Recovery starts here instead of from the first write ever made.
  snapshot = new Map<string, string>();
  // @why A snapshot that has been written but not yet forced to disk. A crash throws it away.
  snapshotInBuffer = new Map<string, string>();
  nextSeq = 1;
  // @why How many records the last recovery had to replay: the cost a checkpoint saves.
  replayed = 0;

  put(k: string, v: string): boolean {
    this.append(k, v); // @mark append
    // @why The write is on disk only after the fsync. Acknowledging before this line is promising something a crash can take back.
    this.flush(); // @mark flush
    this.memory.set(k, v); // @mark apply
    return true; // @mark ack
  }

  // @why Appending at the end is a sequential write: the disk never has to jump around, which makes it the cheapest write there is.
  append(k: string, v: string) {
    const seq = this.nextSeq++;
    const rec: LogRecord = { seq, k, v, checksum: checksum(seq, k, v) };
    this.log.push(rec);
  }

  // @why fsync: wait until the operating system has really written the buffered records to disk.
  flush() {
    this.durable = this.log.length; // @mark fsync
  }

  // @why Power cut. Memory and anything not yet on disk are gone. With `tornTail`, the record that was being written reaches disk only half-written.
  crash(tornTail = false) {
    const half = this.log[this.durable];
    this.memory = new Map(); // @mark crash
    this.log = this.log.slice(0, this.durable);
    this.snapshotInBuffer = new Map();
    if (tornTail && half) {
      // @why Only the first part of the record made it; the rest of the space holds leftover bytes.
      this.log.push({ ...half, v: `${half.v.slice(0, 1)}▒▒` });
      this.durable = this.log.length;
    }
  }

  recover() {
    // @why Start from the last checkpoint's snapshot, so only the records written after it need replaying.
    this.memory = new Map(this.snapshot); // @mark restore
    this.replayed = 0;
    for (let i = 0; i < this.log.length; i++) {
      const rec = this.log[i];
      // @why A record whose checksum does not match was cut short by a crash. It was never acknowledged, so it is dropped, along with anything after it.
      if (rec.checksum !== checksum(rec.seq, rec.k, rec.v)) {
        this.log = this.log.slice(0, i); // @mark torn
        this.durable = i;
        break;
      }
      this.memory.set(rec.k, rec.v); // @mark replay
      this.replayed++;
    }
    this.nextSeq = (this.log.at(-1)?.seq ?? this.nextSeq - 1) + 1;
  }

  checkpoint() {
    this.writeSnapshot(); // @mark snapshot-write
    // @why The snapshot must be on disk before the log is cut. Until then, the log is the only durable copy of these writes.
    this.syncSnapshot(); // @mark snapshot-sync
    this.truncateLog(); // @mark truncate
  }

  writeSnapshot() {
    this.snapshotInBuffer = new Map(this.memory);
  }

  syncSnapshot() {
    this.snapshot = this.snapshotInBuffer;
    this.snapshotInBuffer = new Map();
  }

  // @why Everything in the log is now in the snapshot, so the log can start again empty and recovery stays short.
  truncateLog() {
    this.log = [];
    this.durable = 0;
  }

  get(k: string): string | undefined {
    return this.memory.get(k);
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: applies the write to memory and acknowledges it, and leaves the fsync for later.
export class MemoryFirstStore extends WalStore {
  put(k: string, v: string): boolean {
    this.memory.set(k, v); // @mark mem-first
    this.append(k, v);
    return true; // @mark early-ack
  }
}

// Broken on purpose: cuts the log before the snapshot is forced to disk.
export class TruncateEarlyStore extends WalStore {
  checkpoint() {
    this.writeSnapshot();
    this.log = []; // @mark early-truncate
    this.durable = 0;
  }
}

function putMany(store: WalStore, n: number, prefix: string) {
  for (let i = 1; i <= n; i++) store.put(`${prefix}${i}`, String(i * 10));
}

test("write: log first, then memory", () => {
  const store = new WalStore();
  const acked = store.put("x", "1");
  assert.equal(acked, true);
  assert.deepEqual(
    store.log.map((r) => [r.seq, r.k, r.v]),
    [[1, "x", "1"]],
  );
  assert.equal(store.durable, 1, "the record is on disk before the ack");
  assert.equal(store.get("x"), "1");
});

test("recover: replaying the log rebuilds memory after a crash", () => {
  const store = new WalStore();
  store.put("x", "1");
  store.put("y", "2");
  store.put("x", "3");
  store.crash();
  assert.equal(store.memory.size, 0, "the crash wiped memory");
  store.recover();
  assert.equal(store.replayed, 3);
  assert.equal(store.get("x"), "3", "the later write to x wins");
  assert.equal(store.get("y"), "2");
});

test("checkpoint: snapshot then truncate keeps recovery short", () => {
  const store = new WalStore();
  putMany(store, 6, "k");
  store.crash();
  store.recover();
  const before = store.replayed;
  store.checkpoint();
  store.put("a", "1");
  store.put("b", "2");
  store.crash();
  store.recover();
  assert.equal(before, 6);
  assert.equal(store.replayed, 2, "only the writes after the checkpoint are replayed");
  assert.equal(store.memory.size, 8, "nothing was lost");
  assert.equal(store.get("k6"), "60");
});

test("torn write: a half-written last record is detected and dropped", () => {
  const store = new WalStore();
  store.put("x", "1");
  store.put("y", "2");
  // A third write is in progress: appended, not yet flushed or acknowledged, when the power goes.
  store.append("z", "300");
  store.crash(true);
  assert.equal(store.log.length, 3, "the half-written record is on disk");
  store.recover();
  assert.equal(store.log.length, 2, "recovery dropped it");
  assert.equal(store.get("z"), undefined);
  assert.equal(store.get("y"), "2");
  store.put("w", "4");
  assert.equal(store.log.at(-1)!.seq, 3, "the next write reuses the dropped record's place");
});

test("broken: memory first, log later — a crash loses an acknowledged write", () => {
  const store = new MemoryFirstStore();
  const acked = store.put("x", "1");
  assert.equal(acked, true);
  assert.equal(store.get("x"), "1");
  store.crash();
  store.recover();
  assert.equal(store.get("x"), undefined, "the acknowledged write is gone");
});

test("broken: truncate before the snapshot is durable — a crash loses data", () => {
  const store = new TruncateEarlyStore();
  store.put("x", "1");
  store.put("y", "2");
  store.checkpoint();
  store.crash();
  store.recover();
  assert.equal(store.get("x"), undefined, "x was in neither the log nor a durable snapshot");
  assert.equal(store.get("y"), undefined);
});
