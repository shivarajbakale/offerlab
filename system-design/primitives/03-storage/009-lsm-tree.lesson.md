# LSM tree

## What it is

- **What it is:** A way to store keys and values on disk that is built for fast writes. New writes gather in a sorted table in memory; when it fills, it is written to disk in one pass as a sorted file that is never changed, and background merges combine those files.
- **The problem it solves:** Keeping one sorted file on disk means every new key must be put in its place, which jumps around the disk and rewrites what follows, so random writes get slower as the data grows. An LSM tree turns them into large writes in order, at the cost of reads that may check several files.
- **Reach for it when:** Writes dominate, as with event logs, messages, metrics or time series, the data is much bigger than memory, and reads that are a little slower or less predictable are acceptable.
- **Not the right tool when:** Reads dominate and need steady, predictable speed, or the same keys are updated and range-scanned all the time; a [B+ tree](#/sd-03-storage/010-b-plus-tree) gives each key exactly one place on disk.
- **Where you'll meet it:** LevelDB and RocksDB, and the many databases built on RocksDB; Apache Cassandra, HBase and Google's Bigtable; the 1996 paper by O'Neil, Cheng, Gawlick and O'Neil; and interview questions such as "Design a key-value store" or "Design a metrics store".

## In plain words

Disks are fast when you write a long run of data in one go, and slow when you change small bits in many different places. Keeping one big sorted file means every new key has to be squeezed into the middle of it, which is the slow kind of write. An LSM tree avoids that. It collects new writes in a small sorted table in memory, and when that table is full, it writes the whole thing to disk at once as a new sorted file that is never edited again. Old files are merged in the background.

Think of an office that gets hundreds of letters a day. Instead of walking to the big filing cabinet for each letter, a clerk sorts the day's letters into a tray, and when the tray is full it goes into a new labelled box, in order. Now and then someone merges old boxes into one tidy box and throws away out-of-date letters. Filing is quick. Finding a letter means checking the tray first, then the newest boxes, which is the price paid.

In the picture on the right, the **Memory** band holds the memtable, where writes land. The **Disk** band holds the sorted tables: level 0 has freshly flushed tables, newest on the left, whose key ranges can overlap; level 1 has merged tables that do not overlap. A dagger (†) is a tombstone, which marks a deleted key. During a read, the places it checks light up, numbered in the order it checked them. The box at the top tells each step: the write, the flush, the read, the merge.

## Words we'll use

- **Disk** — storage that keeps its contents through a crash. There is far more of it than memory, but it is slower.
- **Seek** — jumping to a different spot on the disk before reading or writing there. Seeks are what make disks slow.
- **Sequential write** — writing bytes one after another at the end of a file, with no seeks in between. It is the fastest way to write to a disk.
- **Sorted** — kept in key order (a, b, c, ...), so a key can be found by binary search: look in the middle, then in the half that must hold it, and so on.
- **Memtable** — a small sorted table kept in memory, where new writes land.
- **SSTable** (sorted string table) — a file of keys and values in key order. Once written, it is never changed. In the view, tables are named T1, T2, ... in the order they were made.
- **Immutable** — never changed after it is written.
- **Flush** — writing the full memtable to disk as a new SSTable, in one sequential pass.
- **Level** — a group of SSTables. Level 0 (L0) holds freshly flushed tables, newest first. Level 1 (L1) holds merged tables.
- **Tombstone** — a record that says "this key was deleted". The view draws it as †.
- **Compaction** — merging several SSTables into new ones, keeping only the newest version of each key.
- **Read amplification** — how many tables one read has to look in.
- **Write amplification** — how many times each write ends up being written to disk, counting the rewrites done by compaction.

## The world we're in

- A key-value store takes many writes, more than fit in memory, so the data lives on disk.
- On disk, writing at the end of a file is much faster than seeking to spots in the middle of it.
- A crash wipes memory. Here we assume a write-ahead log (lesson 008) makes every write in memory safe from that, so this lesson can ignore crashes.
- A read must return the latest value written for a key, or nothing if the key was deleted.

## The goal

Take writes at the speed of sequential disk writes, and still find the latest value of any key.

## The naive attempt

"Keep all the data in one sorted file, and put each new key into its place." Reads are easy: one binary search. But putting a key in the middle means everything after it must move one slot along and be written again. Here the file holds b, d, f, h, j and l. Writing c moves the five keys after it.
[▶ Broken: the first of the five moves: l is copied one slot along](play:broken: one sorted file@at=shift#1)
[▶ Broken: c is in place, after l, j, h, f and d have each been moved](play:broken: one sorted file@at=placed#7)
Writing a moves all seven.
[▶ Broken: writing a moves every key in the file](play:broken: one sorted file@at=shift#6)
The test then writes 500 random keys. The average write moves more than 100 entries, and the cost keeps growing with the file. On a real disk each write also needs a seek to its spot.

## Building it up

**1. Collect writes in a sorted memtable.** A write goes into a small sorted table in memory. Here c is inserted in front of m. No disk is touched, so a write costs no seek.
[▶ c goes in before m, in memory](play:write@at=insert#2)

**2. Flush a full memtable as an immutable SSTable.** When the memtable holds four keys, it is written out as table T1, in key order, in one sequential pass, and a new empty memtable starts.
[▶ The full memtable becomes T1](play:flush@at=flush)
T1 is never changed again. The next flush makes T2, and so on. This turns many small random writes into a few big sequential ones.

**3. Read newest first, and stop at the first hit.** A key can now be in several places. Its latest value is in the newest place that has it. Here a was written as "old" into T1 and later as "new" into T2. The read checks the memtable first. a is not there, so it opens T2, the newest table.
[▶ No a in the memtable, so the read opens T2](play:read path@at=check-l0)
T2 has a=new, so the read stops. T1 is never opened.
[▶ T2 has a=new, and the read stops](play:read path@at=hit-l0)
Searching the oldest table first gets the wrong answer: T1 says a=old.
[▶ Broken: the read opens T1 first and returns a=old](play:broken: read oldest first@at=stale-hit)

**4. Delete by writing a tombstone.** Old tables are never changed, so a delete cannot remove a from T1. Instead it writes a tombstone for a into the memtable. A read finds the tombstone first and answers "not found", without opening T1.
[▶ The tombstone a=† answers the read](play:delete@at=hit-mem)

**5. Compact to keep reads short.** Every flush adds a table, and a read for a missing key has to check them all: read amplification grows. So when level 0 reaches three tables, compaction merges them into level 1. Here T1, T2 and T3 hold three versions of a, two of b, and a tombstone for d.
[▶ Three overlapping tables in L0, about to be merged](play:compaction@at=drop-tombstones)
The merge keeps only the newest version of each key. L1 is the bottom level, with nothing older below it, so the tombstone for d has nothing left to hide and is dropped. L1 ends up with T4 (a to e) and T5 (f). Its tables do not overlap, so a read in L1 opens just one: here, the read for d opens only T4.
[▶ After compaction: one version per key, and d is gone](play:compaction@at=search-l1)

Dropping a tombstone anywhere above the bottom is a bug. Here a=1 is already in L1. Then a is deleted, and the flush drops the tombstone.
[▶ Broken: the flush throws away a's tombstone](play:broken: drop tombstones@at=early-drop)
The next read for a misses in T7, carries on into L1, and finds the old a=1. The deleted value is back.
[▶ Broken: the read finds the old a=1 in L1](play:broken: drop tombstones@at=search-l1)

**6. Skip tables with a Bloom filter.** Real engines keep a Bloom filter (lesson 005) for each SSTable: a small summary that answers "definitely not here" or "maybe here". A read skips every table whose filter says no, so a miss costs almost no disk reads.

## Why it works now

- A newer write always sits in a newer place: the memtable is newer than every L0 table, L0 tables are newest first, and L0 is newer than L1. So the first place that has the key holds its latest value. [▶ See it](play:read path@at=hit-l0)
- A delete is a write too, so a tombstone hides every older value in the same way.
- Compaction keeps the newest version of each key, and drops a tombstone only at the bottom level, where nothing older can reappear.
- The `read path`, `delete` and `compaction` scenarios check this; the broken scenarios show a stale read and a deleted value coming back when either rule is broken.

## What it costs

- **Read amplification.** A read may check the memtable, every L0 table and one L1 table. A miss is the worst case. Bloom filters cut most of this.
- **Write amplification.** Each entry is written once at flush, then again every time compaction merges it. In this small version L1 is rewritten in full at every compaction, so the cost grows with the data. Real engines add more levels, each about ten times bigger than the one above, so each compaction rewrites only a slice.
- **Space.** Old versions and tombstones take space until compaction removes them.
- **Background work.** Compaction competes with reads and writes for the disk.

## Staff notes

- **Where you meet it.** LevelDB and RocksDB are LSM-tree storage engines built exactly this way: a memtable, sorted files on disk, and compaction. RocksDB is in turn the storage layer under many other databases. Apache Cassandra writes every change to a memtable, flushes it to SSTables and compacts them, keeping a Bloom filter per SSTable. HBase does the same under other names (a MemStore flushed to HFiles), and its Bloom filters are a setting per column family (on by default in recent versions, but they can be turned off). When a database is described as "fast at writes" and talks about compaction, there is usually an LSM tree inside.
- **Leveled or tiered.** Leveled compaction keeps each level's tables from overlapping, so reads stay cheap and little space is wasted, but data is rewritten more often. Tiered compaction merges tables of similar size, rewriting less but leaving more tables for each read to check. Write-heavy workloads lean tiered; read-heavy ones lean leveled.
- **Write stalls.** If writes arrive faster than compaction can merge, level 0 piles up and every read slows down. Engines then slow or stop incoming writes until compaction catches up. Watch L0 table count and pending compaction bytes.
- **Tombstone piles.** A workload that deletes a lot, such as a queue, leaves many tombstones. Range scans have to step over all of them until compaction clears them.
- **Against a B+ tree** (lesson 010): an LSM tree writes faster and stores data more compactly; a B+ tree reads faster and more predictably, because each key has exactly one place.

## Check yourself

- **Q:** Key a is in T1 (older) and in T2 (newer). Which value does a read return, and does it open T1?
  A: T2's value. The read goes newest first and stops at the first table that has the key, so T1 is never opened. [▶ See it](play:read path@at=hit-l0)
- **Q:** Why does a delete write a tombstone instead of removing the key from the table that holds it?
  A: Tables are never changed after they are written. The tombstone is a newer entry that the read finds first. [▶ See it](play:delete@at=hit-mem)
- **Q:** A flush drops a tombstone while an older value of the key is still in L1. What does the next read return?
  A: The old value. Nothing newer hides it any more. [▶ See it](play:broken: drop tombstones@at=search-l1)
- **Q:** Three tables hold three versions of a. After compaction, how many are left?
  A: One, the newest: a=3 in T4. [▶ See it](play:compaction@at=search-l1)
- **Q:** Why is one sorted file slow for random writes?
  A: A new key in the middle makes every key after it move and be written again, and the cost grows with the file. [▶ See it](play:broken: one sorted file@at=shift#6)

## When to use which

- **LSM tree** — when writes far outnumber reads, or arrive in huge bursts. Example: storing click events, chat messages or metrics, where millions of writes a second must be taken in and most data is read rarely.
- **[B+ tree](#/sd-03-storage/010-b-plus-tree)** — when reads matter most and must be fast every time: lookups by key and range queries, with moderate writes. Example: an orders table in a shop's database, read on every page view and updated a few times per order. Each key has exactly one place, so a read never checks several tables.
- **The trade in one line** — an LSM tree makes writes cheap and pays later, in reads that may check several tables and in background merging (compaction); a B+ tree pays on every write, by rewriting pages in place, so reads stay cheap.
- **Add a [Bloom filter](#/sd-02-probabilistic/005-bloom-filter) per table** — when reads for keys that are not there are common. The filter says "definitely not in this table", so the read skips it without a disk read.
- **Leveled vs. tiered compaction** — leveled (as here: one non-overlapping level below) when reads and disk space matter; tiered (merge tables of similar size) when even more write speed matters and slower reads are fine.
- **Needs a [write-ahead log](#/sd-03-storage/008-write-ahead-log)** — the memtable is in memory, so every write is also appended to a log first. Without it, a crash loses everything not yet flushed.
- **In an interview:** say "write-heavy, so an LSM tree", then name its costs: read amplification (several tables per read), write amplification (compaction rewrites data), and tombstones that linger until compaction.

## Deep dive

- Patrick O'Neil, Edward Cheng, Dieter Gawlick and Elizabeth O'Neil, "The Log-Structured Merge-Tree (LSM-Tree)" (1996) introduced the design.
- Fay Chang et al., "Bigtable: A Distributed Storage System for Structured Data" (2006) describes memtables, SSTables and compactions; LevelDB came out of the same ideas at Google.
- The RocksDB wiki describes leveled and universal (tiered) compaction and the settings that trigger write stalls.
- "Designing Data-Intensive Applications" (Martin Kleppmann), chapter 3, compares LSM trees with B-trees.
