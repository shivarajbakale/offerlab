# Raft log replication

## What it is

- **What it is:** The part of Raft that copies each write from the elected leader to the other servers as an ordered, numbered log, and reports a write as done only once more than half of the servers have stored it.
- **The problem it solves:** A leader that says "done" as soon as it has a write can crash or be cut off, and the next leader puts a different write in the same place, so a write the client was told is safe disappears. Majority commit, a consistency check on every message and log-aware voting make every committed write survive any leader change.
- **Reach for it when:** Small, critical state must never lose a confirmed write and must fail over automatically: configuration, cluster metadata, locks, or the per-range log of a distributed database.
- **Not the right tool when:** Losing the last few writes on failover is acceptable and write latency matters more; asynchronous [leader-follower replication](#/sd-05-replication/017-leader-follower-replication) is cheaper. When writes must keep working on both sides of a network split, use a leaderless store with sloppy [quorums](#/sd-05-replication/018-quorum-read-write) and accept conflicts.
- **Where you'll meet it:** The Raft paper, sections 5.3 and 5.4, and Ongaro's thesis "Consensus: Bridging Theory and Practice". etcd and Consul replicate their stores with Raft, CockroachDB and TiKV run a Raft group per range, and Kafka's KRaft keeps metadata in a Raft log. Interview: "Design a distributed key-value store".

## In plain words

Once a group of servers has a leader, the leader has to copy every write to the others so that losing one server loses nothing. The hard part is saying "done" to the client at the right moment. Say it too early, before the copies exist, and a crash can erase a write the user was promised. Raft says "done" only once more than half of the servers have stored the write, so any future majority, and therefore any future leader, is sure to include a server that has it.

Think of a notary office with five clerks. A contract counts as signed only when at least three clerks have filed a copy in their own binders. If the head clerk falls ill, the new head clerk is chosen only among clerks whose binders are at least as complete as the voters' binders, so no signed contract can go missing. A clerk with a gap in their binder is brought up to date page by page.

In the picture on the right, each server is a circle on a ring, with its name and term inside. Under it, its role is written in words (follower, candidate or leader; the leader is filled in colour) and a summary of its log, such as "log: x=1 y=2 · committed up to #2". The client box in the top-left corner sends writes and receives the "done" (WriteOk) replies. Dots moving along the lines are messages: entries being copied, confirmations, votes and heartbeats. A faded node is down, and a dashed red line is a network cut. The box at the top says what just happened and turns green when a write is safely committed, red when something goes wrong. Below, a table shows each server's raw state (its log is written as term:write, for example 1:x=1), and the event log lists every step.

## Words we'll use

- **Node** — one server in the cluster. Every node runs the same program.
- **Tick** — one unit of simulated time (messages here take 1 to 3 ticks to arrive). "t=20" means tick 20.
- **Majority** — more than half of the cluster: 2 of 3, 3 of 5. Any two majorities of the same cluster share at least one node.
- **Leader**, **follower**, **term** — as in lesson 020. Nodes elect one leader per numbered term by majority vote; the others follow it. The leader sends regular **heartbeats**. A follower that hears nothing for a random while **times out** and becomes a **candidate**: it starts a new term and asks for votes. A node that sees a bigger term than its own steps down to follower.
- **RequestVote** — the message a candidate sends every other node: "vote for me in term T". Each node grants at most one vote per term.
- **Round trip** — a message to another node plus its reply coming back.
- **Client** — the program sending writes. Here a write is a short command such as `x=1`.
- **Crash** — a node stops. When it restarts, its memory is gone; only what it wrote to disk survives.
- **Partition** — the network splits, so some nodes can't reach others, while each side keeps running.
- **Log** — an ordered list of commands. Position 1 holds the first command, position 2 the next. A position is called an **index** and written #1, #2, and so on.
- **Entry** — one item of the log: a command plus the term of the leader that added it. The visualizer shows an entry as `term:command`, so `1:x=1` is "x=1, added in term 1".
- **Append** — add an entry at the end of a log.
- **Committed** — an entry is committed once it can never be removed or changed. The client is told "done" only for committed entries. `commitIndex` is the highest index a node knows is committed.
- **AppendEntries** — the leader's message to a follower: "here are new entries for your log". With no entries it is just a heartbeat.
- **Consistency check** — every AppendEntries names the entry just before the new ones, by index and term (`prevLogIndex`, `prevLogTerm`). The follower accepts only if its own log has that exact entry.
- **nextIndex / matchIndex** — the leader's notes on each follower: the next index to send it, and the highest index it is known to store.
- **Up to date** — one log is more up to date than another if its last entry has a bigger term, or, with equal last terms, if it is longer.

## The world we're in

- Nodes crash and restart at any moment. A restart wipes memory; the disk survives.
- Messages take a variable amount of time, and some are lost. Partitions come and go.
- There is no shared clock, so the leader can change at any moment, and an old leader may not know it has been replaced (lesson 020).
- A client that is told "done" believes its write is safe and moves on.

## The goal

Every node holds the same commands in the same order. Once the client is told "done", that write stays at its index forever, whichever node leads later.

## The naive attempt

"The leader appends the write to its own log, tells the client done, and sends it to the followers." That is the asynchronous leader from lesson 017, with an elected leader on top.

Here n1 is cut off from the others at t=18 but still believes it leads. At t=20 it takes x=1 and tells the client "done".
[▶ Broken: n1 says "done" for x=1 while nobody else has it](play:broken: commit on the leader alone@t=20)
Meanwhile n2 and n3 elect n3 in term 2. Its log is empty, so at t=70 it puts y=2 at #1. Two different writes are now "committed" at #1. When the network heals at t=100, n1 follows the new leader and x=1 is overwritten. The client was told "done", and the write is gone.
[▶ Broken: #1 is committed twice, as x=1 and as y=2](play:broken: commit on the leader alone@t=70)

## Building it up

**1. Keep a log, not just the latest value.** Followers must end up with the same commands in the same order. A single "current value" can't tell a follower which writes it missed, or in what order to apply them. A numbered log can. Each entry also records the term of the leader that added it, so entries from different leaders can be told apart. A leader only ever appends to its own log; it never changes or deletes its entries.
[▶ n1 appends x=1 as #1 in term 1](play:commit@t=20)

**2. Commit only once a majority stores the entry.** The leader sends each new entry to every follower, and each follower replies with how far its log now matches. The leader keeps that in `matchIndex`. When a majority (counting itself) stores an entry, the leader marks it committed and only then tells the client "done". The next AppendEntries carries the leader's `commitIndex`, so followers learn it too. Here n3 is down, and n1 plus n2 are enough: x=1 commits at t=23.
[▶ x=1 commits once n2 also stores it](play:commit@t=23)
A leader on the small side of a partition can still append entries, but it can never reach a majority, so nothing it takes is ever committed and its client never hears "done".
[▶ n1 and n2 are cut off; b=2 sits on both but never commits](play:minority leader@t=35)
Why a majority? Because any two majorities share a node. Whoever leads next is elected by a majority, so at least one of its voters stores every committed entry. Step 4 makes that voter count.

**3. Check consistency, and back up on a refusal.** A follower may have missed entries, or may hold entries from a leader that lost. So each AppendEntries names the entry before the new ones. The follower accepts only if it has that exact entry (same index, same term). If the check passes, everything before that point matches too: each earlier entry was accepted by the same check, and a leader adds at most one entry per index in its term and never moves it. Entries after that point that disagree came from a leader that lost, so the follower cuts them off and takes the leader's.

A new leader doesn't know what each follower has. It assumes they match it (`nextIndex` = its own log end + 1), and every refusal makes it back up one entry and try again. Here n5 was down while a, b and c were written. The new leader n2 checks #3, #2 and #1 in turn; n5 refuses each, and then accepts all three entries at once.
[▶ n5 refuses at #3, #2 and #1, then catches up](play:repair@t=75)
Without the check, n5 accepts a heartbeat that assumes it holds #1 to #3, says "I'm in step", and marks entries committed that it doesn't have.
[▶ Broken: n5 claims #1 to #3 with an empty log](play:broken: no consistency check@t=75)
When the partition from step 2 heals, n1 and n2 learn of the newer term. Their uncommitted b=2 at #2 conflicts with the new leader's c=3, so it is cut and replaced.
[▶ The network heals at t=120; b=2 is replaced by c=3 on n1 and n2](play:minority leader@t=120)

**4. Vote only for a candidate whose log is at least as up to date as yours.** Steps 2 and 3 are not enough on their own. In this run x=1 is committed on n1 and n2 while n3 is down. Then n1 crashes and n3 comes back with an empty log. n3 times out first, and n2 votes for it because it only checks terms.
[▶ Broken: n2 votes for n3, whose log is empty](play:broken: votes ignore the log@t=43)
As leader, n3 puts y=2 at #1, and the consistency check makes n2 replace its committed x=1 with it.
[▶ Broken: n2's committed x=1 is overwritten at t=83](play:broken: votes ignore the log@t=83)
The fix: a candidate's RequestVote carries the index and term of its last entry, and a voter refuses a candidate whose log is behind its own. A committed entry is on a majority, and a winner needs a majority of votes, so at least one voter has the entry and refuses anyone missing it. Same faults, same timing, with the check:
[▶ n2 refuses n3: its log is behind](play:leader change@t=43)
[▶ n2 runs for term 3, n3 votes for it, and by t=53 n2 has repaired n3: x=1 survives](play:leader change@t=44)
Why compare the last term before the length? A longer log can be full of entries from an old leader that lost. The last term says how recent a log's history is, and length only breaks ties.

## Why it works now

- An entry is committed only once a majority stores it (step 2). Any later leader won a majority vote, and some voter in it had the entry and would refuse a candidate without it (step 4). So every leader holds every committed entry.
- A leader never deletes its own entries, and a follower only cuts entries past the point where the consistency check matched (step 3). So committed entries are never removed. A follower's `commitIndex` only covers entries the leader's message vouched for.
- The visualizer checks after every event that no index is ever committed with two different entries. It holds through a leader change [▶ see it hold](play:leader change@t=83), and breaks the moment votes ignore the log [▶ see it break](play:broken: votes ignore the log@t=83).

## What it costs

- **A round trip to a majority for every write.** The client hears "done" only after the entry reaches enough followers and their replies come back. Here x=1 arrives at t=20 and the client hears "done" at t=24. In a real system each follower also writes the entry to disk before replying.
[▶ Write at t=20, "done" at t=24](play:commit@t=20)
- **A majority must be up and reachable.** 3 nodes survive 1 failure; 5 survive 2. A leader cut off with a minority keeps accepting writes it can never commit.
[▶ The minority leader can't commit b=2](play:minority leader@t=35)
- **Backing up costs one round trip per entry.** A follower far behind takes many round trips to find where it matches.
[▶ Three refusals before n5 matches](play:repair@t=75)

## Staff notes

- **A leader commits only entries from its own term by counting copies.** An entry from an older term can be on a majority and still be overwritten: a node whose last entry has a newer term can win an election without it and replace it. So the leader waits until an entry of its own term is on a majority; that commits it and every entry before it. The Raft paper's figure 8 walks through this case. Leaders usually append an empty "no-op" entry when elected, so older entries commit promptly. This file follows the rule but skips the no-op.
- **Faster backing up.** A refusal can carry the conflicting entry's term and the first index of that term, so the leader skips a whole term per round trip instead of one entry.
- **Snapshots.** Logs can't grow forever. Nodes save a snapshot of the state and discard the log before it; a follower too far behind gets the snapshot instead.
- **Reads.** A leader that was cut off can still believe it leads, so answering reads from its own state can return stale data. It must first confirm it still leads, with a round of heartbeats to a majority, or rely on a time-based lease (lesson 023).
- **Duplicate writes.** If the leader crashes after committing but before replying, the client retries and the command can be committed twice. Clients attach an id and a sequence number to each command, so the nodes can recognise and skip a repeat.
- Real systems also batch many entries per message and send the next batch before the previous reply arrives, and they change cluster membership with a separate, careful protocol.

## Check yourself

- **Q:** In a 5-node cluster, a leader has an entry on its own log and on one follower. Is the entry committed?
  A: No. That is 2 of 5, not a majority. In this run n1 and n2 both hold b=2 while cut off, and the client never hears "done". [▶ See it](play:minority leader@t=35)
- **Q:** n3 comes back with an empty log and runs for leader. Why can't it win?
  A: n2 holds the committed x=1, and refuses to vote for a candidate whose log is behind its own. Without n2's vote, n3 has no majority. [▶ See it](play:leader change@t=43)
- **Q:** A new leader doesn't know how much each follower has. How does it find out?
  A: It assumes the follower matches it, and the consistency check refuses if not. Each refusal makes it back up one entry, until the check passes and it sends everything after that point. [▶ See it](play:repair@t=75)
- **Q:** What goes wrong if the leader says "done" as soon as it has the write itself?
  A: If it is cut off or crashes, the others elect a leader without that write, and a different write gets the same index. The client's "done" write is lost. [▶ See it](play:broken: commit on the leader alone@t=70)

## When to use which

- **Raft log replication** — when a confirmed write must never be lost and failover must be automatic, and you can afford a majority round trip on every write. Example: etcd storing Kubernetes' cluster state, or each range of a CockroachDB table.
- **Asynchronous [leader-follower replication](#/sd-05-replication/017-leader-follower-replication)** — when writes must be fast and losing the last few on failover is acceptable. The leader says "done" at once and ships copies later. Example: read replicas for a blog or product catalogue database.
- **Semi-synchronous replication** — a middle ground: wait for one follower, ship to the rest in the background. Example: MySQL semi-sync. Cheaper than a majority, but failover still needs care to pick the follower that has the write.
- **Leaderless [quorum reads and writes](#/sd-05-replication/018-quorum-read-write)** — when writes must keep working even when no single leader is reachable, and conflicting versions can be merged later. Example: a shopping cart in a Dynamo-style store.
- **Use an existing Raft store, don't write your own** — when you need a little consistent state (config, locks, leader lease) for a bigger system. Run etcd, Consul or ZooKeeper and keep the bulk data elsewhere; pair it with [leases and fencing tokens](#/sd-05-replication/023-leases-and-fencing-tokens) for "one worker at a time".
- **In an interview:** say "writes go to the Raft leader and are acknowledged once a majority has them; a 5-node group survives 2 failures, and each write costs one round trip to the nearest majority". Contrast it with async replication's lower latency and possible loss on failover.

## Deep dive

- "In Search of an Understandable Consensus Algorithm" (Ongaro and Ousterhout, 2014): section 5.3 covers log replication and section 5.4 safety, including figure 8.
- Diego Ongaro's PhD thesis, "Consensus: Bridging Theory and Practice", covers client interaction, log compaction and membership changes in detail.
- etcd and Consul replicate their key-value stores with Raft. CockroachDB and TiKV run one Raft group per range of data. Kafka's KRaft mode keeps cluster metadata in a Raft-based log.
