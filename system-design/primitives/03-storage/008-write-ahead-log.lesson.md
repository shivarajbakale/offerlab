# Write-ahead log

## What it is

- **What it is:** A file that a database adds every change to, always at the end, and forces onto disk before telling the client the write is done. After a crash, the database reads the file back and redoes each change in order.
- **The problem it solves:** Data held in memory vanishes in a crash, so a client told "saved" can lose its write; and changing data files in place is slow and can leave them half old, half new. Writing each change first to an append-only log on disk makes every acknowledged write survive a crash, using fast writes at the end of one file.
- **Reach for it when:** A store keeps its data in memory, or changes data files in place, and must not lose a write it has acknowledged: databases, key-value stores, consensus logs. Also when replicas need a stream of changes to replay.
- **Not the right tool when:** Losing the last few writes is fine, such as in a cache that can be refilled from the source; then skip the log or the wait for the disk. If data is only ever written as whole new files, writing each file and then recording it may be enough.
- **Where you'll meet it:** PostgreSQL's WAL, MySQL InnoDB's redo log and SQLite's WAL mode; the log behind the in-memory table in LevelDB and RocksDB; etcd's WAL; the ARIES recovery paper (1992); and interview questions such as "Design a key-value store".

## In plain words

A database wants to keep its data in memory, because memory is fast. But memory is wiped the moment the power goes out. So if the database says "saved" while the data is only in memory, a crash can quietly take that write back. A write-ahead log fixes this with one rule: before changing anything, first write down what you are about to do, at the end of a file on disk, and wait until it is really there.

Think of a shopkeeper who keeps the day's sales in their head but also writes each sale in a notebook before handing over the receipt. If they faint and forget everything, they read the notebook from the top and know exactly where things stood. The notebook only works if each sale is written down *before* the receipt is given, and the ink has dried.

In the picture on the right there are three bands. **Memory** (orange edge) holds the data the store serves reads from; a crash empties it. **OS buffer** (dashed) holds a snapshot that has been written but not yet forced to disk. **Disk** (teal edge) holds the log file and the last snapshot; it survives a crash. In the log, records left of the green line are on disk, and records right of it are dashed: still in the buffer, so a crash loses them. The box at the top says what just happened, including the crash and the restart.

## Words we'll use

- **Memory** — where a running program keeps its data (RAM). Fast, but wiped when the machine crashes.
- **Disk** — storage that keeps its contents through a crash, such as an SSD or a hard drive.
- **Crash** — the machine stops suddenly: a power cut, a kernel panic, a killed process. Nothing gets a chance to tidy up.
- **Acknowledge (ack)** — tell the client "your write is done". After that the client will not send it again, so losing it means losing data.
- **OS buffer** — when a program writes to a file, the operating system first keeps the bytes in its own memory and copies them to disk a little later. Bytes still in the buffer are lost in a crash.
- **fsync** — a request to the operating system: "write this file's buffered bytes to disk, and return only when they are there".
- **Durable** — on disk, so a crash cannot take it away. In the view, log records to the left of the green **durable** line are on disk.
- **Log** — a file that is only ever added to at the end. Each addition is a **record**: here a sequence number (#1, #2, ...), a key, a value and a checksum.
- **Checksum** — a number computed from a record's contents. If any part of the record is damaged, the number no longer matches.
- **Torn write** — a record that a crash cut off part-way, so only its first part reached disk.
- **Replay** — read the log from the start and redo each write into memory.
- **Snapshot** — a full copy of memory saved to a file.
- **Checkpoint** — save a snapshot, then delete the log records it already contains.

## The world we're in

- The store keeps every key and value in memory, in a map, so reads are fast.
- The machine can crash at any moment, between any two lines of code. After a crash, memory is empty. Files keep exactly what had reached disk.
- Writing to a file puts the bytes in the OS buffer. They are on disk only after an fsync, or whenever the operating system gets round to it.
- Disks are much faster at adding to the end of a file than at jumping around to change spots in the middle. A hard drive has to move its head for every jump; SSDs also do best with large writes in order.

## The goal

Once a client has been told a write is done, that write survives any crash.

## The naive attempt

"Put the write in memory, tell the client it is done, and add it to the log file in the background." The client never waits for the disk, so writes are fast.

Here the store sets x=1 in memory and acknowledges it. Its log record has been appended, but it sits to the right of the durable line: it is still in the OS buffer.
[▶ Broken: x=1 is acknowledged while its record is only in the buffer](play:broken: memory first@at=early-ack)
Then the machine crashes. Memory is wiped, the buffer goes with it, and recovery finds an empty log. The client was told x=1 was saved, and it is gone.
[▶ Broken: after the crash, the log is empty and x=1 is lost](play:broken: memory first@at=restore)

Writing straight into a data file instead, in place, does not help. Each write would mean jumping to that key's spot in the file, which is slow. And a crash in the middle of the update leaves the file half old and half new, with no way to tell which parts are which.

## Building it up

**1. Append to the log, fsync, and only then apply and acknowledge.** The write goes to the end of the log first. Here the record for x=1 has been appended but is still right of the durable line.
[▶ The record x=1 is in the log, still in the buffer](play:write@at=flush)
The fsync moves the durable line past it. Memory has not changed yet.
[▶ After the fsync, the record is on disk](play:write@at=fsync)
Only now is x=1 put in memory, and only after that does the client get its ack.
[▶ Memory gets x=1, and then the client is acknowledged](play:write@at=apply)
A crash at any point before the ack loses nothing that was promised. A crash after it finds the record on disk.

**2. Replay the log after a crash.** The log holds every acknowledged write, in order. Here x=1, y=2 and x=3 were written, and then the machine crashed: memory is empty, and the log is intact.
[▶ After the crash: empty memory, three records on disk](play:recover@at=restore)
Recovery replays the records in order. Record #3 sets x again, to 3, just as it did the first time, so the result is the memory we had before the crash.
[▶ Replaying #3: x goes from 1 back to 3](play:recover@at=replay#3)

**3. Checksums catch torn writes.** A record can be half-written when the power goes. Here x and y are acknowledged, and z=300 is being written when the crash comes. Only its first character reached disk; the rest of the space holds leftover bytes, drawn as ▒.
[▶ The torn record z=3▒▒ is on disk](play:torn write@at=restore)
Recovery replays x and y. For z, it recomputes the checksum, which does not match, so it cuts the log there instead of loading garbage into memory.
[▶ The checksum fails, and the torn record is dropped](play:torn write@at=torn)
Dropping z breaks no promise: its fsync never finished, so it was never acknowledged.

**4. Checkpoints keep recovery short.** Without them, the log grows forever and recovery replays all of it. Here six writes are replayed one by one.
[▶ Recovery replays all six records](play:checkpoint@at=replay#6)
A checkpoint writes a snapshot of memory, and the snapshot first lands in the OS buffer.
[▶ The snapshot is written, but not yet on disk](play:checkpoint@at=snapshot-sync)
It is forced to disk, and only then is the log cut.
[▶ The snapshot is durable; now the log can go](play:checkpoint@at=truncate)
After two more writes and another crash, recovery starts from the snapshot and replays only the two new records.
[▶ Recovery starts from the six-key snapshot](play:checkpoint@at=restore#2)

The order matters. If the log is cut while the snapshot is still in the buffer, there is a moment when the writes are in neither durable place.
[▶ Broken: the log is cut while the snapshot is only in the buffer](play:broken: truncate before@at=early-truncate)
A crash in that moment loses both x and y.
[▶ Broken: after the crash, nothing is left to recover](play:broken: truncate before@at=restore)

## Why it works now

- A write is acknowledged only after its record is durable: in the code, the ack comes after the fsync. So every acknowledged write is in the durable log or in a durable snapshot.
- Recovery loads the snapshot and replays the log in order, which redoes every acknowledged write in the order it happened. [▶ See it rebuild memory](play:recover@at=replay#3)
- A torn record fails its checksum and is never applied. It can only be the last record, the one that was being written, and it was never acknowledged.
- A checkpoint deletes log records only after the snapshot holding them is durable.
- The tests check each of these: the `recover`, `torn write` and `checkpoint` scenarios pass, and both broken scenarios show an acknowledged write being lost when one order is swapped.

## What it costs

- **An fsync per write.** Each write waits for the disk. Depending on the device, an fsync takes from tens of microseconds to several milliseconds, and that caps how many writes per second one log can take.
- **Recovery time.** Recovery replays everything since the last checkpoint. Checkpoint rarely, and restarts are slow.
- **Checkpoints write everything.** This one copies all of memory. Real systems spread that work out or copy only what changed.
- **Disk space.** The log keeps growing until the next checkpoint.
- **An unknown outcome.** If the crash comes after the fsync but before the ack, the write survives, yet the client never heard back. If the client retries, the write happens twice, unless writing it twice is harmless.

## Staff notes

- **Group commit.** Instead of one fsync per write, a store collects the writes that arrive while one fsync is running, and makes them durable together with the next one. Each write waits a little longer; throughput goes up a lot.
- **The log is also the replication stream.** A follower that receives the same records and replays them ends up with the same data. Many databases build replicas by shipping their log this way.
- **Trust the disk carefully.** Real logs checksum every record, put the log on a device that honours fsync, and treat a failed fsync as serious. In 2018 PostgreSQL developers found that on Linux a failed fsync could not safely be retried, and changed PostgreSQL to stop and recover from its log instead.
- **What gets logged.** This log records key=value writes. Database logs often record changes to fixed-size blocks of a data file, so that a half-finished update to a block can be repaired.
- **This is the durability piece of an LSM tree** (lesson 009): the memtable there is the memory here, and it is rebuilt from a log like this one after a crash.

## Check yourself

- **Q:** The store fsyncs, then acknowledges. The machine crashes just after the ack. Is the write safe?
  A: Yes. Its record is on disk, left of the durable line, and recovery replays it. [▶ See it](play:recover@at=replay#1)
- **Q:** A crash cuts the last record in half. What does recovery do with it, and why is that safe?
  A: Its checksum does not match, so recovery drops it and stops there. It was never acknowledged, because its fsync never finished. [▶ See it](play:torn write@at=torn)
- **Q:** The store puts a write in memory and acknowledges it before the record is on disk. What can a crash do?
  A: Lose the write. Memory is wiped, the record was still in the buffer, and the client was already told it was saved. [▶ See it](play:broken: memory first@at=restore)
- **Q:** Six writes, a checkpoint, then two more writes and a crash. How many records does recovery replay?
  A: Two. The first six are in the snapshot, and the log was cut after it became durable. [▶ See it](play:checkpoint@at=replay#8)
- **Q:** Why must the snapshot be forced to disk before the log is cut?
  A: Until it is, the log is the only durable copy of those writes. Cut it first, and a crash in between loses them. [▶ See it](play:broken: truncate before@at=restore)

## When to use which

- **Write-ahead log** — whenever data lives in memory, or is changed in place on disk, and an acknowledged write must never be lost. Example: a key-value store that answers "saved" to clients, or a database changing pages of a [B+ tree](#/sd-03-storage/010-b-plus-tree) in place.
- **No log at all** — when losing the last few writes after a crash is fine, because the data can be rebuilt from somewhere else. Example: a cache in front of a database; after a restart it just fills up again.
- **Write the whole new file, then switch to it** — when data is only ever written as complete new files and never edited. Example: the sorted tables of an [LSM tree](#/sd-03-storage/009-lsm-tree) are written once and never changed; only its in-memory table needs a log in front of it.
- **fsync every write vs. group commit** — fsync each write when writes are few and each must be safe on its own. Batch many writes into one fsync (group commit) when there are thousands per second: each write waits a little longer, but the disk does far fewer flushes.
- **Ship the log to other machines** — when one machine's disk is not enough, because the whole machine can be lost. The same log, sent to followers and replayed there, is how [leader-follower replication](#/sd-05-replication/017-leader-follower-replication) and [Raft log replication](#/sd-05-replication/021-raft-log-replication) keep copies.
- **In an interview:** when asked "what happens if the server crashes mid-write?", say: append the change to a log, fsync, then apply it and reply; on restart, load the last snapshot and replay the log; checkpoint so the log stays short.

## Deep dive

- C. Mohan et al., "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging" (1992) is the classic design for recovery with a write-ahead log in databases.
- The PostgreSQL documentation has a chapter, "Reliability and the Write-Ahead Log", on how its WAL, checkpoints and crash recovery fit together.
- This log only redoes writes. Databases that let a transaction change data files before it commits also need to undo those changes after a crash, so their logs carry enough to undo as well as redo.
