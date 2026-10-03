# Key-value store

## What it is

- **What it is:** A store with two operations: save a value under a key, and get it back by that key. Spread over many machines, with copies of each key, it is the storage under carts, sessions and settings.
- **What makes it hard:** One machine cannot take the traffic, and once keys are spread over machines every lost machine loses its keys, so each key needs copies. Then copies disagree for a while, and a user can save a setting and see the old one on the next page load.
- **Building blocks it uses:** [consistent hashing](#/sd-01-partitioning/001-consistent-hashing) to place keys, [leader-follower replication](#/sd-05-replication/017-leader-follower-replication) for copies, [quorum reads and writes](#/sd-05-replication/018-quorum-read-write) to reason about stale reads, and [leader election](#/sd-05-replication/020-raft-leader-election) to replace a dead primary.
- **Where you'll meet it:** "Design a key-value store" is a classic interview question. Amazon's Dynamo paper (SOSP 2007) introduced sloppy quorums and hinted handoff, and Riak and Cassandra borrow its replication design. etcd is a key-value store that replicates with Raft.

## Words we'll use

- **Key-value store** — a store with two operations: **get**(key) returns the value saved under a key, and **put**(key, value) saves one. No queries, no joins. Here, gets are **reads** and puts are **writes**.
- **Node** — one storage machine.
- **Shard** — one slice of the keys, held by its own node (or nodes). A hash of the key picks the shard, so every caller agrees where a key lives.
- **Consistent hashing** — a way to pick the shard so that adding or removing a node moves only a small share of the keys (primitive 001). Plain "hash mod N" moves most keys when N changes.
- **Replica** (copy) — another node holding the same shard. **N** is the number of copies of each key; here N = 3.
- **Primary** — in this simulator, the first copy of each shard: it takes the puts and passes each change on to the others (leader-follower replication, primitive 017).
- **Replica lag** — how far a copy trails the primary. Here 300 ms.
- **Stale read** — a get that returns an older value than the latest put. **Read your own writes** — a caller's get right after its own put sees that put.
- **Quorum** — with N copies, a put waits for **W** of them to confirm and a get asks **R** of them; if R + W > N over the key's own home copies (a **strict quorum**), every get hears from at least one copy that has the latest put (primitive 018).
- **Hot key** — one key that gets so much traffic that its shard is far busier than the rest.
- **Zipf skew** — the popularity pattern: the k-th most popular key gets traffic in proportion to 1/k^s. Higher s, more traffic on the top keys.

## The world we're in

- Other services send 3,000 requests a second: 90% gets, 10% puts, over a million keys. Popularity is mildly skewed (Zipf 0.8): popular keys get more, no key dominates.
- Half the time, 200 ms after a put, the same caller gets the same key again: to check it, or to show the user what they just saved.
- A node has 4 cores and spends 2 ms on a get and 4 ms on a put (a put is written to a log on disk first). On this mix that is about 2.2 ms per request: one node handles about 1,800 a second.
- Machines die. A node can disappear at any moment and stay gone.
- One honest simplification: Dynamo-style stores (Dynamo, Cassandra, Riak) have no primary; any copy takes puts. This simulator replicates by leader and followers. Where the two differ, the lesson says so.

## The goal

Handle the traffic, keep working when a node dies, and know exactly what a get may return while copies disagree: at least, a caller always sees its own put.

## The naive attempt

"One node holds every key."

3,000 requests a second at 2.2 ms each is 6.6 seconds of work a second, on 4 cores: 1.7 nodes' worth. The node sits at 100%, requests queue, about 41% fail, and half of the ones that succeed take over 150 ms.
[▶ Broken: one node](play:broken: one node@t=6)

## Building it up

**1. Shard the keys.** Hash each key to one of 8 nodes. Each holds an eighth of the keys and gets about an eighth of the traffic. With mild skew the load is even: every node is about 21% busy, every request takes under 13 ms, for about $3.09 an hour. (A real store picks the node by consistent hashing, so that adding a ninth node moves about a ninth of the keys, not most of them. The simulator uses a plain hash; it never adds nodes during a run.)
[▶ Eight shards](play:shards: eight nodes@t=6)

But each key now lives on exactly one machine. When node 3 dies, every get and put for its eighth of the keys fails: about 11% of all requests, for as long as it is down. If its disk is gone, so is the data.
[▶ Broken: a node dies and its keys are gone](play:broken: shards — one node dies@t=6)

**2. Keep three copies of every shard.** Put each shard on three nodes, ideally in different racks or zones. Here the first copy takes the puts and answers at once, then passes the change to the other two, which apply it about 300 ms later. Gets go to either of the other two copies. Now one copy can die and nothing fails at all: its gets move to the other copy. Three copies cost three times the nodes: about $8.53 an hour.
[▶ One copy dies, nothing fails](play:copies: one copy dies@t=6)

Copies that answer without waiting can be behind. 200 ms after a caller's put, its get lands on a copy that is 300 ms behind: every such reread returns the old value. A user saves a setting, the page reloads, and the old setting is back. Across all gets, about 8% return an old value.
[▶ Broken: your own put is not there 200 ms later](play:broken: copies — a reread@t=6)

In quorum terms this design is W = 1 (only the primary confirms a put) and R = 1 (a get asks one copy). R + W = 2 is not more than N = 3, so a get can miss the latest put. Waiting for more copies (W = 2, R = 2) closes that gap at the price of slower requests; primitive 018 builds this step by step.

This design has a second weakness. When the *first* copy of a shard dies, gets carry on from the other two, but there is nobody to take its puts: in this simulator no copy is promoted, and over 10% of all puts fail (fewer than 0.5% of gets). A leader-follower store must elect a new primary (Raft, primitive 020), which takes from well under a second to a few seconds, set mostly by the failure-detection timeout. A Dynamo-style store has no primary: any copy takes the put, and if one of the key's copies is down, another node holds the write for it and hands it over when it returns (a "sloppy quorum" with "hinted handoff"). The price is that two copies can accept different puts for the same key, and the store must notice and merge them later (Dynamo and Riak track versions with vector clocks, primitive 019; Cassandra instead keeps the value with the newest timestamp, last write wins).
[▶ Broken: the primary dies, its puts fail](play:broken: copies — the first copy dies@t=6)

**3. Read your own writes.** For one second after a caller's put, send its gets for any key to the first copy, which always has its own put. Every reread now sees the put. Other callers' gets still go to the copies, and about 3% of all gets are still behind. That is the deal: you see your own writes at once, and other people's within about 300 ms. The first copies take those rereads too, and every node stays under 12% busy.
[▶ Read your own writes](play:read your own writes@t=6)

A Dynamo-style store gets the same promise differently: the caller asks for a strict quorum read (R + W > N over the key's home copies; with a sloppy quorum the write may sit on a stand-in node and a quorum read can still miss it) when it needs one, or the client remembers the version it wrote and rejects an older answer.

**4. Watch the hot key.** Change the skew to 1.5 and one key gets about 38% of all traffic. It lives on one shard, so that shard's three nodes are over 18% busy while the median node is under 5%. Adding shards does not help: one key never splits. And because the hot key is also put over 100 times a second here, its copies are always a few puts behind. The next few keys (about 13% and 7% of traffic) are also put far more often than once per 300 ms of lag, so the top few keys' copies cannot keep up: most gets of them, and about 60-80% of all gets, return an old value. Read-your-writes still holds for each caller's own puts.
[▶ Broken: a hot key](play:broken: a hot key@t=6)

What to do about a hot key depends on why it is hot:
- Read-hot, rarely written: cache it in the routers or the callers for a short time, and spread its gets over all copies.
- Write-hot (a counter, a live score): split it into several keys on different shards and add them up on read, or batch the puts (case study 10).
- In either case, find it first: count requests per key at the routers.

## Why it works now

Each step answers one question. Sharding answers "how much traffic": split the keys so each node does a share. Copies answer "what if a node dies": another node holds the same keys. Read-your-writes answers "what may a get return": a caller is never shown something older than its own put, and everyone else sees a value at most about 300 ms old.
[▶ Broken: copies, and your own put is missing](play:broken: copies — a reread@t=6)
[▶ Read your own writes](play:read your own writes@t=6)

## What it costs

- Three copies mean three times the machines and disks, and three times the put traffic between nodes.
- Every guarantee about freshness is paid for: either by pinning some reads to one copy (that copy does more work), or by asking more copies (slower gets and puts).
- A store with a primary stops taking puts for a shard until a new primary is chosen. A store without one keeps taking puts, and must merge conflicting versions later.
- Not simulated: adding nodes and moving keys, repairing a copy that missed changes (Dynamo-style stores compare copies with Merkle trees, primitive 011), and merging conflicting versions.

## Staff notes

- Choose N, W and R per use. A shopping cart wants puts that never fail (W = 1, merge later); an account balance wants a single leader (or consensus) with linearizable reads; quorums alone do not make read-modify-write safe.
- Replica lag is the staleness. Measure it, alert on it, and say the number when someone asks "is it consistent?".
- Place copies in different failure domains: a rack, a power feed, a zone. Three copies in one rack are one copy.
- Use consistent hashing with many virtual nodes per machine, so that when a node dies its load spreads over many others rather than one neighbour.
- Hot keys are normal under Zipf traffic. Have a plan before the first one: per-key metrics, a cache in front, and a way to split a key.

## Check yourself

- **Q:** Eight shards carry the load. Why is that not enough?
  A: Each key lives on one node. When a node dies, its eighth of the keys are unavailable, about 11% of requests. [▶ Show it](play:broken: shards — one node dies@t=6)
- **Q:** With three copies, why does a user not see the setting they saved 200 ms ago?
  A: Their get went to a copy 300 ms behind the primary. With W = 1 and R = 1, a get can miss the latest put. [▶ Show it](play:broken: copies — a reread@t=6)
- **Q:** The first copy of a shard dies. Why do gets carry on but puts fail?
  A: The other copies can still answer gets, but only the primary takes puts here, and nobody replaces it. [▶ Show it](play:broken: copies — the first copy dies@t=6)
- **Q:** How does read-your-writes fix the user's problem, and what does it not promise?
  A: Their gets right after a put go to the first copy, which has it. Other callers can still see values up to ~300 ms old. [▶ Show it](play:read your own writes@t=6)
- **Q:** Why does adding shards not help a hot key?
  A: One key always lives on one shard. More shards only move the other keys away; the hot one needs a cache or to be split. [▶ Show it](play:broken: a hot key@t=6)
