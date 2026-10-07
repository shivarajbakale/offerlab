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
  // @viz levels:memory,log@durable,snapshotInBuffer,snapshot,hot=rec,memory=memory,buffer=snapshotInBuffer,disk=log|snapshot,title.memory=The_data_(key_→_value),title.log=Write-ahead_log_file,title.snapshotInBuffer=Snapshot_being_written,title.snapshot=Snapshot_file_(last_checkpoint)
  // @viz hide:durable,nextSeq,replayed,seq,h,s,i,tornTail,half,rec,k,v
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
    // @caption Only now that its record is on disk does {k}={v} go into memory, where reads will find it fast.
    this.memory.set(k, v); // @mark apply
    // @caption good: The client is told "saved". This promise is safe: even if the power goes this instant, {log[log.length - 1].k}={log[log.length - 1].v} is in the log on disk and recovery will replay it.
    return true; // @mark ack
  }

  // @why Appending at the end is a sequential write: the disk never has to jump around, which makes it the cheapest write there is.
  append(k: string, v: string) {
    const seq = this.nextSeq++;
    const rec: LogRecord = { seq, k, v, checksum: checksum(seq, k, v) };
    // @caption The write {k}={v} becomes record #{seq}, added to the end of the log file, the cheapest kind of disk write. For now it sits in the operating system's buffer (dashed, right of the green line), not on disk: a crash would lose it.
    this.log.push(rec);
  }

  // @why fsync: wait until the operating system has really written the buffered records to disk.
  flush() {
    // @caption fsync: the store waits until the operating system has really written the log to disk. {durable === 1 ? "The record is" : "All " + durable + " records are"} now left of the green line: safe from a crash. Memory has not changed yet.
    this.durable = this.log.length; // @mark fsync
  }

  // @why Power cut. Memory and anything not yet on disk are gone. With `tornTail`, the record that was being written reaches disk only half-written.
  crash(tornTail = false) {
    const half = this.log[this.durable];
    this.memory = new Map(); // @mark crash
    this.log = this.log.slice(0, this.durable);
    // @caption Crash! The power goes out and the machine restarts. Memory is now empty, and anything still in the buffer is gone. Only the disk is left: {log.length} log record{log.length === 1 ? "" : "s"}{snapshot.size ? " and a snapshot of " + snapshot.size + " keys" : ", and no snapshot"}.
    this.snapshotInBuffer = new Map();
    if (tornTail && half) {
      // @why Only the first part of the record made it; the rest of the space holds leftover bytes.
      // @caption Crash, in the middle of writing record #{half.seq}! Memory is empty. The first {durable} records are safe on disk, but #{half.seq} ({half.k}={half.v}) reached disk only half-written: its end is leftover bytes, drawn ▒.
      this.log.push({ ...half, v: `${half.v.slice(0, 1)}▒▒` });
      this.durable = this.log.length;
    }
  }

  recover() {
    // @why Start from the last checkpoint's snapshot, so only the records written after it need replaying.
    // @caption {log.length === 0 && snapshot.size === 0 ? "bad: Recovery starts, and finds nothing on disk: no log records and no snapshot. Every write the client was told was saved is gone for good." : "Recovery starts. Memory is first loaded from the snapshot (" + (snapshot.size ? snapshot.size + " keys" : "none yet") + "), then the " + log.length + " log record" + (log.length === 1 ? "" : "s") + " on disk will be replayed, oldest first."}
    this.memory = new Map(this.snapshot); // @mark restore
    this.replayed = 0;
    for (let i = 0; i < this.log.length; i++) {
      const rec = this.log[i];
      // @why A record whose checksum does not match was cut short by a crash. It was never acknowledged, so it is dropped, along with anything after it.
      if (rec.checksum !== checksum(rec.seq, rec.k, rec.v)) {
        // @caption good: Record #{rec.seq} fails its checksum: the crash cut it in half. It was never fsynced, so the client was never told "saved". Recovery drops it, instead of loading garbage into memory, and stops here.
        this.log = this.log.slice(0, i); // @mark torn
        this.durable = i;
        break;
      }
      // @caption Replaying record #{rec.seq}: {rec.k}={rec.v} goes back into memory. Records are redone in the order they were written, so a later write to the same key wins, just as it did before the crash.
      this.memory.set(rec.k, rec.v); // @mark replay
      this.replayed++;
    }
    // @caption {memory.size === 0 ? "bad: Recovery is finished, and memory is still empty. The client was told its writes were saved, and they are lost." : "good: Recovery is finished: memory holds all " + memory.size + " keys again, rebuilt from " + (snapshot.size ? "the snapshot plus " : "") + replayed + " replayed log record" + (replayed === 1 ? "" : "s") + ". No acknowledged write was lost."}
    this.nextSeq = (this.log.at(-1)?.seq ?? this.nextSeq - 1) + 1;
  }

  checkpoint() {
    this.writeSnapshot(); // @mark snapshot-write
    // @why The snapshot must be on disk before the log is cut. Until then, the log is the only durable copy of these writes.
    this.syncSnapshot(); // @mark snapshot-sync
    this.truncateLog(); // @mark truncate
  }

  writeSnapshot() {
    // @caption Checkpoint, step 1: a copy of memory ({snapshotInBuffer.size} keys) is written to a snapshot file. Like any file write, it lands in the buffer first: not on disk yet.
    this.snapshotInBuffer = new Map(this.memory);
  }

  syncSnapshot() {
    // @caption Checkpoint, step 2: fsync the snapshot. Its {snapshot.size} keys are now safe on disk, so the log records they came from are no longer needed.
    this.snapshot = this.snapshotInBuffer;
    this.snapshotInBuffer = new Map();
  }

  // @why Everything in the log is now in the snapshot, so the log can start again empty and recovery stays short.
  truncateLog() {
    // @caption good: Checkpoint, step 3: the log is emptied. Everything it held is in the durable snapshot, so nothing is lost, and the next recovery replays only writes made after this point.
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
    // @caption This store puts {k}={v} in memory first, and means to write the log later.
    this.memory.set(k, v); // @mark mem-first
    this.append(k, v);
    // @caption bad: The client is told "saved", but record #{log.length} for {log[log.length - 1].k}={log[log.length - 1].v} is still in the buffer (dashed): there was no fsync. A crash right now would lose a write the client believes is safe.
    return true; // @mark early-ack
  }
}

// Broken on purpose: cuts the log before the snapshot is forced to disk.
export class TruncateEarlyStore extends WalStore {
  checkpoint() {
    this.writeSnapshot();
    // @caption bad: The log is emptied while the snapshot ({snapshotInBuffer.size} keys) is still only in the buffer. For this moment, no copy of these writes exists on disk at all.
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
