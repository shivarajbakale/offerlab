# Leader-follower replication

## What it is

- **What it is:** A way to keep several copies of a database. One server, the leader, takes every write and records it in a numbered list called a log. The other servers, the followers, copy that log in order and can answer reads.
- **The problem it solves:** One database server loses everything when it dies and can only answer so many reads, but copies that are each sent a write just once silently drift apart when one misses a message. A numbered log that the leader keeps resending keeps every copy the same, only some way behind.
- **Reach for it when:** Data must survive a dead server, reads outnumber writes, and you want a ready copy to take over. This is the default meaning of "add read replicas" in most designs.
- **Not the right tool when:** Writes must keep working while the leader is unreachable; a leaderless [quorum](#/sd-05-replication/018-quorum-read-write) design keeps taking writes while any W copies are reachable. When failover must be automatic and never lose a write the client was told is done, use consensus, as in [Raft log replication](#/sd-05-replication/021-raft-log-replication).
- **Where you'll meet it:** PostgreSQL streaming replication, MySQL binary log replication, MongoDB replica sets and Redis replicas all work this way. Kleppmann's "Designing Data-Intensive Applications", chapter 5, covers replication lag, read-your-writes and failover. Read replicas come up in almost every system design interview.

## Words we'll use

- **Replica** — one copy of the database, on its own server.
- **Leader** — the one replica that accepts writes. The others are **followers**: they copy the leader and can answer reads.
- **Log** — the list of writes in the order the leader applied them. Each entry gets a **sequence number**: 1, 2, 3, and so on.
- **Ack** (acknowledge) — a reply that says "done". The leader acks the client; followers ack the leader.
- **Replication lag** — how far a follower is behind the leader.
- **Stale read** — a read that returns an older value than the latest write.
- **Durable** — written to disk, so it survives a crash.
- **Flush** — the leader's regular round of sending followers the entries they still need.
- **Failover** — when the leader dies and a follower is **promoted**: made the new leader.

## The world we're in

- A single server can die, and a single server can only answer so many reads.
- Messages between servers take time, and some are lost.
- Servers crash and restart. A restart wipes memory but not the disk.
- Clients send writes to one place and want their reads to be fast.

## The goal

Keep several copies of the same data, so reads can be spread across servers and the data survives a dead server, without the copies drifting apart.

## The naive attempt

"The leader sends each write to the followers once."

That works until a follower is down for a moment. Whatever was sent while it was down is gone, and nothing ever sends it again. The follower is now missing data for good, and nobody notices.
[▶ Broken: n2 is down when write #3 is shipped and never gets it](play:broken: ship each write once@t=8)

## Building it up

**1. Number every write and apply in order.** The leader gives each write the next sequence number. Followers apply entries strictly in number order and hold back anything that arrives early. So every follower passes through exactly the leader's states, only later. That delay is replication lag.
[▶ Followers trail the leader, then catch up](play:async replication@t=1)
Applying entries the moment they arrive goes wrong as soon as an old message is slow: it lands after newer ones and overwrites them.
[▶ Broken: a late batch puts x back to 1 on the followers](play:broken: apply as it arrives@t=9)

**2. Followers ack how far they got, and the leader resends the rest.** Every few ticks the leader sends each follower every entry it hasn't confirmed. Duplicates are harmless, because a follower skips numbers it already has. A follower that missed messages, for any reason, catches up on the next round.
[▶ n2 is down from t=8 to t=20, then catches up](play:follower restarts@t=8)

**3. Keep the log on disk.** There are two reasons. First, at failover a follower may be promoted, and then its copy is the only copy; if it lived in memory, one restart would erase writes the client was told were done. Second, a replica that comes back empty has to be rebuilt by copying the whole data set again. In this simulation it is worse: the leader only ever moves a follower's position forward, because acks can arrive late and out of order, so it ignores the restarted follower's "I have nothing" and never refills it. Real systems detect this case and re-copy from a snapshot, which is slow.
[▶ Broken: data only in memory](play:broken: data only in memory@t=8)
[▶ With the log on disk, a restarted follower picks up where it left off](play:follower restarts@t=20)

**4. Read your own writes.** Followers lag, so a client that writes and then reads from a follower can get back its old value.
[▶ A stale read](play:stale read@t=2)
The fix: the leader's ack carries the write's sequence number. The client sends that number with its read, and the follower waits until it has applied it.
[▶ The follower holds the read until it catches up](play:read-your-writes@t=2)

## Why it works now

- Every replica applies the same numbered log in the same order, so a replica can be behind but never different.
- The leader resends until each follower acks, so any follower that is up and reachable eventually catches up, however many messages it lost.
- The log is on disk, so a restart resumes from where the replica was, not from nothing.
- The visualizer checks after every event that each follower's log is exactly the start of the leader's. It holds while followers lag [▶ see it hold](play:async replication@t=4), and breaks the moment entries are applied twice or out of order [▶ see it break](play:broken: apply as it arrives@t=15).

## What it costs

- **Stale reads.** Reads from followers can be behind. Read-your-writes fixes this for one client, at the cost of waiting.
- **Lost writes on failover.** The leader acks before followers have the write. If it dies before shipping and a follower is promoted in its place, that acknowledged write is gone.
[▶ The write exists only on the crashed leader](play:leader crashes@t=3)
- **Going synchronous** (acking the client only once followers have the write) removes that loss, but makes every write as slow as the slowest follower it waits for.

## Staff notes

- Many production setups are **semi-synchronous**: wait for one follower, and ship to the rest in the background.
- Treat replication lag as a first-class metric. Alert on it, and stop sending reads to a follower that is too far behind.
- Failover needs two rules: promote the most caught-up follower, and **fence** the old leader so it can't keep accepting writes when it comes back (lesson 023). Picking the new leader automatically and safely is consensus (lesson 020).
- Read-your-writes needs the client to carry its last write position, for example in a session token. That gets awkward when one user has several devices.

## Check yourself

- **Q:** A follower is down while the leader takes two writes. Once it is back, does it get them?
  A: Yes. The leader keeps resending everything the follower hasn't acked, so it catches up on the next flush. [▶ See it](play:follower restarts@t=20)
- **Q:** The leader acks a write, then crashes before shipping it. What do the followers have?
  A: Nothing for that write. It exists only on the crashed leader's disk; promote a follower now and the write is lost. [▶ See it](play:leader crashes@t=3)
- **Q:** A client writes x and immediately reads x from a follower. What can it see?
  A: The old value, because the follower hasn't received the write yet. Sending the write's sequence number with the read makes the follower wait. [▶ See it](play:stale read@t=2)
- **Q:** Why does each follower need its log on disk, if the leader has everything anyway?
  A: Because at failover a follower can be promoted, and then its copy is the only copy of the acknowledged writes. A follower that restarts empty also has to be rebuilt from scratch; in this run it never recovers at all. [▶ See it](play:broken: data only in memory@t=8)

## Deep dive

- PostgreSQL streaming replication works this way: the primary streams its write-ahead log, and each standby reports how far it has written, flushed and replayed.
- MySQL replicas pull the primary's binary log from a recorded position, and resume from that position after a restart.
- "Designing Data-Intensive Applications" (Martin Kleppmann), chapter 5, covers replication lag, read-your-writes and failover in depth.
