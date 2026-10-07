# Quorum reads and writes

## What it is

- **What it is:** A way to keep several copies of data with no leader. Each write goes to all N copies and counts as done once W of them confirm. Each read asks the copies, waits for R answers, and returns the newest.
- **The problem it solves:** Waiting for every copy on every write means one dead server stops all writes, but waiting for fewer means some copies miss writes and reads can return old data. Choosing R + W greater than N makes every read hear from at least one copy that has the latest confirmed write.
- **Reach for it when:** A key-value store must keep taking writes while a replica is down, with no leader to fail over, and you want to tune each request between speed and freshness, such as reading with R = 1 when slightly old data is fine.
- **Not the right tool when:** You need one agreed order of writes, or reads that behave exactly like a single copy; quorums alone don't give that, so use [Raft](#/sd-05-replication/021-raft-log-replication). For scaling reads with one writer, [leader-follower replication](#/sd-05-replication/017-leader-follower-replication) is simpler.
- **Where you'll meet it:** Amazon's Dynamo paper (2007) popularised N, R and W. Apache Cassandra lets each request pick a consistency level such as ONE, QUORUM or ALL, and Riak lets clients set n_val, r and w. The overlap rule goes back to Gifford's weighted voting (1979). Interview: "Design a key-value store".

## In plain words

Imagine three friends each keep a copy of the family shopping list. When you add "milk", you text all three, and once two of them reply "got it" you stop worrying. Later, to check the list, you ask all three and wait for two answers. Because two plus two is more than three, at least one of the friends you hear back from must be one who wrote down "milk", even if the third one's phone was off. Each item also carries a number that only goes up, so when the answers disagree you trust the higher number.

That is a quorum: no single friend is in charge, nobody has to be reachable every time, and a few overlapping answers are enough to be sure you see the latest change. The numbers W (how many must confirm a write) and R (how many must answer a read) are dials you turn between speed and freshness.

In the picture on the right, the coordinator (the server the client talks to) and the three copies r1, r2 and r3 sit on a circle. Under each one is its role and, in words, what it holds right now, such as "has x=new v2". The client box is in the top-left corner. Dots on the lines are messages on their way: Store carries a copy of a write, Stored is a copy saying "saved", Fetch and Fetched are a read's question and answer, and Repair fixes a stale copy. The box at the top says what just happened, green when the system did the right thing and red when something went wrong. Below the circle is the raw state of every server, and under that, a log of every event.

## Words we'll use

- **Replica** — one copy of the data, on its own server. Here there are three: r1, r2 and r3.
- **N** — how many replicas each piece of data has. Here N = 3.
- **Client** — the program that wants to write and read data.
- **Coordinator** — the server the client talks to. It passes each request on to the replicas and collects their answers.
- **Ack** (acknowledge) — a reply that says "done". A replica acks the coordinator; the coordinator acks the client.
- **Version** — a number stamped on every write. Each new write gets a bigger one, so a bigger version means a later write.
- **Stale** — older than the latest acknowledged write. A stale replica is missing a write; a stale read returns an old value.
- **W** — how many replica acks the coordinator waits for before telling the client a write is done.
- **R** — how many replica replies the coordinator waits for before answering a read.
- **Quorum** — a group of replicas big enough to act for all of them: W replicas for a write, R for a read.
- **Timeout** — how long the coordinator waits for its W acks or R replies before telling the client the request failed. Here, 10 ticks (units of simulated time).
- **Read repair** — after a read, sending the newest value to any replica that answered with an older one.

## The world we're in

- Each replica keeps its data on disk, so a restart does not lose what it stored.
- Replicas crash and come back. While a replica is down, everything sent to it is lost.
- Messages take time, and some are lost on the way.
- No replica is in charge of the others. (Some systems pick one replica, called the leader, to put all writes in order and copy them to the rest. This one doesn't.) Every replica takes writes from the coordinator directly.

## The goal

When the client has been told a write is done, every later read returns that write or a newer one, even with one replica down.

## The naive attempt

"Send every write to all three replicas and wait until all three have it. Then every replica is up to date, so a read can ask any one of them."

Reads are cheap and never stale. But the coordinator now needs every replica for every write. One replica down is enough to stop all writes. Here r3 crashes at the start, and the write to x waits for an ack that will never come. At t=4 r1 and r2 store x=1, and the copy meant for r3 is lost because r3 is down.
[▶ Broken: r1 and r2 store x=1; r3's copy is lost](play:broken: wait for all@t=4)
At t=12 the coordinator has 2 of the 3 acks it needs, gives up and tells the client the write failed.
[▶ The write fails after 10 ticks](play:broken: wait for all@t=12)

## Building it up

**1. Wait for W acks, not all N.** The coordinator still sends the write to all three replicas, but tells the client "done" after W of them confirm. With W = 2, one replica can be down and writes keep working. Here r3 is down again. At t=6 the acks from r1 and r2 arrive, and that is enough: the coordinator tells the client x=1 is written.
[▶ r3 is down, and x=1 is acknowledged with acks from r1 and r2](play:replica down@t=6)

That fixes writes, but it breaks the naive read. The write is now on only W replicas, so a read that asks just one replica (R = 1) can pick one that missed it. In this run W = 2 and R = 1. x=old is on all three replicas. Then at t=9 the copy of x=new meant for r1 is lost. r2 and r3 store it and ack, so the client is told x=new is written. Then the client reads x. At t=19 r1 answers first, and with R = 1 its answer is the result: x=old.
[▶ Broken: W=2, R=1, and the read returns x=old after x=new was acknowledged](play:broken: R + W@t=19)

**2. Read from R replicas, with R + W > N.** Ask all replicas and wait for R replies. If R + W is bigger than N, there are not enough replicas for the R that reply to all be ones the write missed. At least one of them is among the W that stored the write. With N = 3, W = 2 and R = 2: the write is on 2 of the 3, at most 1 replica lacks it, and a read hears from 2. This run has the same lost message as the broken one. The read hears from r1, which is stale, and from r2, which has x=new.
[▶ The read set holds r1 (stale) and r2 (fresh)](play:overlap@t=19)

**3. Pick the reply with the highest version.** Overlap guarantees that one of the replies is fresh, but the replies disagree: r1 says x=old, r2 says x=new. Without some way to tell them apart, the coordinator has to guess. Here it takes the first reply to arrive. That is r1's, so the read returns x=old, even though both replies were in hand and one of them was fresh.
[▶ Broken: r1's stale reply arrives first, and the coordinator returns it](play:broken: first reply wins@t=19)
The fix: the coordinator stamped each write with the next version number, so the higher version is the later write. r1 answers version 1, r2 answers version 2, and the coordinator returns x=new.
[▶ r1 says version 1, r2 says version 2, and the answer is x=new](play:overlap@t=19)
Replicas use the same rule when they store: a copy with a lower version than the one they hold is ignored. That matters because messages can be slow. In this run x=old is written at t=1, but its copies are held up on the network. x=new is written at t=2 and reaches every replica first. At t=8 the old copies finally arrive, and each replica keeps version 2.
[▶ The late x=old copies arrive, and every replica keeps x=new](play:late write@t=8)
A replica that stores whatever arrives last is moved backwards by the late copy, and the next read returns x=old.
[▶ Broken: the late x=old overwrites x=new on every replica](play:broken: no version check@t=8)

**4. Repair stale replicas during reads.** A replica that missed a write stays behind. Every read that lands on it has to be outvoted. Here r3 is down while x=new is written, and comes back still holding x=old. The next read asks all three replicas. At t=18 r1 and r2 answer x=new, which is enough to answer the client. r3's reply, x=old, arrives right after, but the coordinator still checks it and sends r3 the newest value.
[▶ r1 and r2 answer version 2; then r3 answers version 1 and is sent version 2](play:read repair@t=18)
At t=20 the client gets x=new, and r3 stores x=new.
[▶ The client gets x=new, and r3 stores it](play:read repair@t=20)
Without read repair, the read is still correct, because r1 and r2 outvote r3. But r3 keeps x=old, and the system is one more failure away from a stale read.
[▶ Broken: r1 and r2 answer; r3's old reply is seen and left alone](play:broken: no read repair@t=18)

## Why it works now

- A write is acknowledged only once W replicas store it. A read answers only once R replicas reply. Since R + W > N, those two groups always share at least one replica, and that replica has the write.
- Versions grow with every write, so the newest reply is the one with the biggest version, and the coordinator picks it.
- Replicas never replace a value with a lower version, so lost, late or repeated messages can't move a replica backwards.
- The visualizer checks after every event that a read returns at least the version that was acknowledged before the read began. It holds with W = 2 and R = 2 [▶ see it hold](play:overlap@t=19), and breaks with W = 2 and R = 1 [▶ see it break](play:broken: R + W@t=19).

## What it costs

- **Every request goes to all N replicas.** That is N messages out and up to N replies back for each read and each write.
- **Latency is set by the W-th or R-th fastest replica.** With W = 2 of 3, one slow or dead replica doesn't slow writes. With W = 3, it stops them.
- **Too many replicas down stops everything.** With N = 3 and W = 2, two replicas down means no write can get two acks. Raising W makes reads safer with a smaller R, but makes writes easier to block.
- **A failed write is not undone.** When a write gets fewer than W acks, the client is told it failed, but the replicas that did ack keep the value. A later read can return a write the client was told had failed.
[▶ r1 and r2 keep x=1 although the client is told the write failed](play:broken: wait for all@t=12)

## Staff notes

- **Sloppy quorum and hinted handoff.** When some of a key's home replicas can't be reached, a sloppy quorum lets the write count acks from other, stand-in nodes. The stand-in keeps the write with a note (a hint) saying where it belongs, and passes it on when the home replica is back: that is hinted handoff. Writes stay available, but the W acks may come from nodes no read will ask, so R + W > N no longer guarantees overlap.
- **R + W > N is not the same as linearizability** (behaving as if there were one copy). Concurrent writes, failed writes that landed on some replicas, and sloppy quorums can all let two reads disagree about the order of writes.
- **Where versions come from.** Here one coordinator hands out version numbers, which only works because there is one coordinator. In real Dynamo-style systems many nodes coordinate requests at the same time, so there is no single counter. They use timestamps, where the latest timestamp wins and clock skew can silently drop a write, or vector clocks, which detect concurrent writes instead of picking one (lesson 019).
- **Read repair only fixes keys that are read.** Data that nobody reads can stay stale for good, so these systems also run a background repair that compares replicas. The Dynamo paper uses Merkle trees (trees of hashes) to find differences cheaply.
- Common choices with N = 3: W = 2 and R = 2 for balanced safety, or W = 1 and R = 1 when speed matters more than reading the latest write.

## Check yourself

- **Q:** N = 3 and W = 2. One replica is down. Can clients still write?
  A: Yes. Two replicas are up, and two acks are all a write needs. [▶ See it](play:replica down@t=6)
- **Q:** With N = 3, W = 2 and R = 1, how can a read miss a write that was acknowledged?
  A: The write may be on just two replicas, and the read may hear only from the third. 2 + 1 is not more than 3, so nothing forces the two to overlap. [▶ See it](play:broken: R + W@t=19)
- **Q:** A read gets x=old at version 1 from one replica and x=new at version 2 from another. What does the coordinator return, and why?
  A: x=new. Versions only grow, so version 2 is the later write. Taking whichever reply came first would return x=old. [▶ See it](play:broken: first reply wins@t=19)
- **Q:** A replica was down during a write and is back now. How does it get the write in this design?
  A: The next read of that key hears its old version and sends it the newest value. Without read repair it stays stale. [▶ See it](play:read repair@t=18)
- **Q:** With W = 3, a write gets only 2 acks and the client is told it failed. Is the value gone?
  A: No. r1 and r2 stored it and keep it. The coordinator reports failure, but nothing undoes the write on the replicas that took it. [▶ See it](play:broken: wait for all@t=12)

## When to use which

- **Quorum reads and writes (this lesson)** — when writes must keep working while any one copy is down, with no leader to fail over. A shopping-cart store in the style of Dynamo or Cassandra, set to N=3, W=2, R=2, keeps taking orders while one server reboots.
- **W=1, R=1 (fast but loose)** — when speed matters more than freshness and an old value now and then is harmless, such as a view counter or "last seen" time. Reads can miss a confirmed write, as in the [R + W ≤ N story](play:broken: R + W@t=19).
- **W=N (wait for every copy)** — almost never for writes: it is synchronous replication to every copy, so one down server blocks all writes, as in the [wait-for-all story](play:broken: wait for all@t=12).
- **A single leader** — when one server can take all the writes and you mostly need to scale reads, such as a typical web app's database with read replicas. Use [leader-follower replication](#/sd-05-replication/017-leader-follower-replication). Its copies are usually filled asynchronously (the leader says "done" before the copies have it), so it is fast, but a failover can lose the newest writes. Waiting for one follower first (semi-synchronous) closes most of that gap.
- **Consensus (Raft)** — when every write must land in one agreed order and reads must never go backwards, such as a lock service, a bank ledger or cluster settings. Use [Raft log replication](#/sd-05-replication/021-raft-log-replication). It also waits for a majority, but through a single elected leader.
- **Version numbers versus [vector clocks](#/sd-05-replication/019-vector-clocks)** — one counter on the coordinator orders writes simply. When several servers accept writes on their own and two users can change the same thing at once, vector clocks spot the conflict instead of silently dropping one write.
- **In an interview:** say "N=3 copies, W=2, R=2, so R + W > N and every read overlaps the last confirmed write", then mention read repair and a background anti-entropy job for keys that are rarely read.

## Deep dive

- Read and write quorums that must overlap (r + w greater than the total) go back to David Gifford, "Weighted Voting for Replicated Data" (1979).
- "Dynamo: Amazon's Highly Available Key-value Store" (DeCandia et al., 2007) popularised the N, R, W settings together with sloppy quorums, hinted handoff and read repair. It describes an internal Amazon store, not the later DynamoDB service.
- Apache Cassandra lets each request choose a consistency level, such as ONE, QUORUM (a majority of the replicas) or ALL. Riak lets clients set n_val, r and w.
- "Designing Data-Intensive Applications" (Martin Kleppmann, 1st edition), chapter 5, covers leaderless replication, quorums and their limits in depth.
