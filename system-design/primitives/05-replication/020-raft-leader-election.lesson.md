# Raft leader election

## What it is

- **What it is:** The part of the Raft protocol that lets a small group of servers, usually 3 or 5, choose one leader by majority vote in numbered rounds called terms, and choose a new one on their own when the leader dies.
- **The problem it solves:** If each server simply takes charge when it stops hearing from the leader, two can do so at once, accept different writes and split the data in two, which is called split brain. One vote per server per term, and a majority to win, allow at most one leader per term.
- **Reach for it when:** A design needs exactly one node in charge with automatic failover: a coordination store, a lock service, a metadata server, a job scheduler, or the leader of a replicated log.
- **Not the right tool when:** Writers can safely act at the same time and their conflicts can be merged; leaderless [quorums](#/sd-05-replication/018-quorum-read-write) avoid elections entirely. If you already run etcd, ZooKeeper or Consul, use their leader election rather than building one; a [lease](#/sd-05-replication/023-leases-and-fencing-tokens) from them is often enough.
- **Where you'll meet it:** The Raft paper (Ongaro and Ousterhout, 2014), section 5.2. etcd, which stores Kubernetes' cluster state, and Consul use Raft. CockroachDB and TiKV run one Raft group per range of data, and Kafka's KRaft mode replaced ZooKeeper with a Raft controller quorum.

## In plain words

A group of servers that keeps one shared copy of some data needs exactly one of them in charge, the leader, so that writes happen in one agreed order. If the leader dies, the others must pick a new one by themselves, and they must never end up with two leaders at once, because two leaders would accept different writes and the data would split in two.

Think of a club choosing a chair by show of hands. Each member gets one vote per meeting, and you need more than half the members to win. Two people can't both get more than half, because that would need someone to vote twice. Each new meeting gets a higher number (a "term"), so a vote from an old meeting never counts in a new one. The chair keeps saying "I'm still here" (a heartbeat); if members hear nothing for a while, they call a new meeting.

In the picture on the right, each server is a circle on a ring, with its name and current term inside. Under it, its role is written in words (follower, candidate asking for votes, or leader, which is filled in colour) with a short summary such as "follows n1 · voted for n1" or "has 2 votes: n3,n1". Dots moving along the lines are messages: vote requests, votes and heartbeats. A faded node marked "down" has crashed, and a dashed red line is a network cut. The box at the top says what just happened and turns red when something goes wrong. Below the picture, a table shows each server's raw state, and the event log lists every step.

## Words we'll use

- **Node** — one server in the cluster. Every node runs the same program.
- **Cluster** — the group of nodes working together, here 3 to 5 of them.
- **Message** — data one node sends another over the network. It can arrive late, or never.
- **Crash** — a node stops. When it restarts, its memory is gone; only what it wrote to disk survives.
- **Partition** — the network splits, so some nodes can't reach others, while each side keeps running.
- **Leader** — the one node allowed to decide the order of writes. The others are **followers**.
- **Candidate** — a node asking the others to make it leader.
- **Majority** — more than half of the cluster: 2 of 3, 3 of 5.
- **Term** — a numbered period with at most one leader. Terms only ever go up.
- **Heartbeat** — a small "I'm still here" message the leader sends regularly.
- **Log** — the ordered list of writes the leader hands to the followers. Copying it safely is lesson 021.
- **Commit** — a write is committed once a majority of nodes have stored it. Only then is it safe to tell the client "done".

## The world we're in

- Nodes crash and restart at any moment. A restart wipes memory; the disk survives.
- Messages take a variable amount of time, and some are lost.
- There is no shared clock. A node can't tell "the leader is dead" from "the leader's messages are slow".
- Nodes are honest: they run the protocol as written. Nobody lies.

## The goal

At most one leader per term, and when the leader dies, the others choose a new one on their own.

## The naive attempt

"If you haven't heard from the leader for a while, become the leader."

The trouble is that "a while" can run out for two nodes at nearly the same moment, and nothing stops both of them from deciding they're in charge. Two leaders accept different writes in different orders, and the data splits in two. This is called **split brain**.
[▶ Watch two nodes crown themselves at t=5](play:broken: leader on timeout@t=5)

## Building it up

**1. Ask for votes, and win only with a majority.** A node that wants to lead becomes a candidate and asks everyone for a vote. Each node gives at most one vote, and the candidate needs a majority. Two candidates can't both get a majority: any two majorities of the same cluster share at least one node, and that node voted only once.
[▶ n1 times out first, collects votes and leads](play:calm start@t=5)

**2. Number the elections with terms.** Votes are "one per term", not "one forever", so new elections can happen later. Every message carries the sender's term. A node that sees a bigger term than its own knows it is out of date and steps down to follower. That is how a leader that was cut off finds out it has been replaced.
[▶ A partition: the majority elects a term-2 leader while n1 still thinks it leads term 1](play:partition@t=40)
[▶ The network heals and n1 steps down](play:partition@t=160)
Without new terms, a vote once given is spent forever, so after the first leader dies nobody can ever collect a majority again.
[▶ Broken: no new terms, and no leader after n1 crashes](play:broken: no new terms@t=40)

**3. Write the vote, and the term it was for, to disk before answering.** If a node forgot either in a crash, it could vote again in the same term, and two candidates could both reach a majority.
[▶ Broken: n2 forgets its vote after a restart, and term 1 gets two leaders](play:broken: votes not saved@t=6)

**4. Randomize the timeouts.** If every node waits the same time, they all run at once and all vote for themselves, so the vote can keep splitting round after round. In this run every message takes exactly the same time, so nobody ever wins.
[▶ Broken: identical timeouts, no leader ever](play:broken: fixed timeouts@t=15)
With random timeouts, one node usually wakes up first. Even when two tie, the next round almost certainly won't.
[▶ A split vote in term 1, settled in a later term](play:split vote@t=5)

**5. The leader sends heartbeats.** Each heartbeat resets the followers' timers, so nobody starts an election while the leader is alive. When the heartbeats stop, the timers run out and step 1 starts again.
Without heartbeats, followers can't tell a healthy leader from a dead one, so they keep starting elections and replacing a leader that was fine.
[▶ Broken: no heartbeats, so at t=30 the followers start replacing a leader that is fine](play:broken: no heartbeats@t=30)
[▶ The leader crashes at t=40 and a new one is elected](play:leader crashes@t=40)

## Why it works now

- One vote per node per term, kept on disk, plus "you need a majority", means at most one leader per term. Two majorities always overlap in a node that voted only once.
- Terms only grow, and any node that sees a bigger term steps down. A stale leader finds out the moment it talks to anyone newer.
- The visualizer checks "never two leaders in one term" after every event, and a test runs 200 random histories of crashes and partitions against it.

## What it costs

- **A majority must be up and reachable.** 5 nodes survive 2 failures. The smaller side of a partition can't elect a new leader, and its old leader can't commit writes, because no majority will store them. Raft would rather stop than give two different answers.
- **Failover is not instant.** Followers wait a whole election timeout before acting. A shorter timeout fails over faster but starts more needless elections when the network is merely slow.
- **A replaced leader can still believe it leads.** Until it hears a bigger term it may answer reads with stale data, so it must not serve reads on its own say-so.

## Staff notes

- Real Raft also compares logs before voting: a node only votes for a candidate whose log is at least as up to date as its own (lesson 021). Without that, a new leader could erase writes that were already confirmed.
- **Pre-vote**: a node first asks "would you vote for me?" without raising its term, so a node that keeps dropping in and out of a partition can't keep forcing elections.
- Set election timeouts well above your p99 round-trip time and garbage-collection pauses, and alert on how often leadership changes.
- Run 3 or 5 nodes, not 4 or 6. An even count adds a machine without adding a failure you can survive.
- Leader leases (lesson 023) let a leader answer reads locally, at the price of trusting clocks.

## Check yourself

- **Q:** In a 5-node cluster, the leader is cut off together with one follower. Who can commit writes now?
  A: Only the other three, once they elect a new leader in a higher term. The old leader may still accept requests, but with 2 of 5 nodes it can never get a majority to store them, so nothing it takes commits. [▶ See it](play:partition@t=40)
- **Q:** Why must a node write its vote to disk before answering?
  A: Otherwise a node that crashes right after voting can vote again in the same term, and two candidates can each reach a majority. [▶ See it](play:broken: votes not saved@t=6)
- **Q:** What happens if every node uses the same election timeout?
  A: They all become candidates together, vote for themselves, and nobody ever gets a majority. [▶ See it](play:broken: fixed timeouts@t=15)
- **Q:** A node receives a heartbeat whose term is lower than its own. What does it do?
  A: It ignores it and answers with its own, newer term. The old leader steps down as soon as any newer-term message reaches it; in this run the new leader's heartbeat gets there first. [▶ See it](play:partition@t=160)

## When to use which

- **Raft leader election** — when a small group (3 or 5 servers) must agree on one leader by itself and fail over automatically, with no outside service to lean on. Example: the servers of a coordination store such as etcd electing which one takes writes.
- **A lease from an existing coordination service** ([leases and fencing tokens](#/sd-05-replication/023-leases-and-fencing-tokens)) — when your own servers just need "one of us is in charge" and you already run etcd, ZooKeeper or Consul. Example: one of ten scheduler instances runs the nightly jobs; it holds a lease in etcd, and the others take over when it expires. This is the usual answer: don't build elections into every service.
- **Manual or scripted failover of a [leader-follower](#/sd-05-replication/017-leader-follower-replication) database** — when failover can take a minute and a person or a tool like Patroni (which itself uses etcd) can promote the most caught-up replica. Example: a PostgreSQL primary with read replicas.
- **No leader at all: [quorum reads and writes](#/sd-05-replication/018-quorum-read-write)** — when any server should accept writes and conflicts can be merged, so there is nothing to elect. Example: a shopping cart in a Dynamo-style store.
- **Gossip membership** ([gossip failure detection](#/sd-05-replication/022-gossip-failure-detection)) — when you only need to know who is alive, not who is in charge. It never picks a leader.
- **In an interview:** say "the metadata or lock service is a 3- or 5-node Raft group (etcd/ZooKeeper); everything else gets leadership from it through leases with fencing tokens". Mention that a majority must be reachable, so a 5-node group survives 2 failures.

## Deep dive

- The Raft paper, "In Search of an Understandable Consensus Algorithm" (Ongaro and Ousterhout, 2014), section 5.2, covers leader election.
- etcd and Consul use Raft for their coordination stores. CockroachDB and TiKV run one Raft group per range of data. Kafka's KRaft mode replaced ZooKeeper with a Raft-based controller quorum.
- Election is half of Raft. The other half, copying the log safely, is lesson 021.
