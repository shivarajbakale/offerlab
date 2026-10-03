# Gossip failure detection (SWIM)

## What it is

- **What it is:** A protocol, called SWIM, by which each server in a cluster checks one random peer per round, asks a few other servers to double-check before raising suspicion, and spreads news about failures by attaching it to messages it already sends.
- **The problem it solves:** Having every server send "I'm alive" to every other costs about n² messages, which breaks down at hundreds or thousands of servers, while a single cheap ping wrongly declares a healthy server dead when one network path breaks. SWIM keeps each server's cost constant and makes false alarms rare.
- **Reach for it when:** A large cluster where every node needs a roughly current list of which peers are up, for routing requests, balancing load or placing data, without a central monitor that must itself stay up and keep pace.
- **Not the right tool when:** Every node must agree on exactly one leader or lock holder at the same moment; gossip views disagree for a while, so use [Raft leader election](#/sd-05-replication/020-raft-leader-election) or [leases with fencing tokens](#/sd-05-replication/023-leases-and-fencing-tokens). A small, fixed cluster can simply have everyone heartbeat everyone.
- **Where you'll meet it:** The SWIM paper (Das, Gupta and Motivala, 2002). HashiCorp's memberlist library implements it, with the Lifeguard extensions, and Serf and Consul use it for membership. Cassandra spreads cluster state by gossip and uses a phi-accrual failure detector.

## Words we'll use

- **Node** — one server in the cluster. Every node runs the same program.
- **Cluster** — the group of nodes working together, here 5 of them.
- **Message** — data one node sends another over the network. It can arrive late, or never.
- **Tick** — one unit of simulated time. Messages here take a tick or two to arrive.
- **Crash** — a node stops. Messages sent to it are lost, and it sends nothing.
- **Bad link** — the network path between two particular nodes is broken, while each of them can still reach everyone else.
- **Member list** — each node's own list of the other nodes, each marked **alive**, **suspect** or **dead**. Every node keeps its own list, and two lists can disagree for a while.
- **Heartbeat** — a small "I'm still here" message sent at regular intervals.
- **Ping** and **ack** — a ping asks "are you there?"; an ack (acknowledgement) is the reply "yes".
- **Probe** — one attempt to check a node: ping it and wait for the ack.
- **Round** — a fixed stretch of time (15 ticks here). Each node starts one probe per round.
- **Timeout** — how long a node waits for a reply before acting as if none will come.
- **False positive** — a node that is actually fine, declared dead.

## The world we're in

- Nodes crash at any moment, without warning anyone.
- Messages take a variable amount of time, and some are lost. Some links break while others work.
- There is no shared clock, and no way to look inside another machine. A node can't tell "that node is dead" from "that node is slow" or "the path to it is broken". All it ever sees is a reply, or no reply.
- Nodes are honest: they run the protocol as written.

## The goal

Every live node learns, within a few rounds, that a crashed node is dead, while healthy nodes are almost never declared dead. The cost per node should stay the same however large the cluster grows.

## The naive attempt

The obvious design is "everyone heartbeats everyone". With n nodes that is n × (n − 1) messages per interval: 20 for 5 nodes, but about a million for 1,000 nodes. It does not scale.

So try something cheaper: each round, every node pings one other node. If no ack comes back before the timeout, that node is dead, and everyone is told.

That is cheap, but it trusts a single network path. In this run only the link between n1 and n3 is broken; everyone else can reach both of them. n1's ping to n3 is lost, so at t=7 n1 declares n3 dead, a healthy node. At t=43 n3's ping to n1 is lost the same way, and n3 declares n1 dead. Both healthy nodes end up dead on every list.
[▶ Broken: n1 gets no ack and declares a healthy n3 dead](play:broken: direct pings only@t=7)
[▶ Broken: n3 does the same to n1](play:broken: direct pings only@t=43)

## Building it up

**1. Probe one peer per round, in a shuffled order.** Each node walks through its peers in a random order, one per round, and reshuffles once it has probed them all (one **pass**). Random means no node gets probed by everyone at once. Because every node probes someone every round, *some* node probes any given node very soon: the SWIM paper works out about 1.6 rounds on average (e/(e − 1)), however big the cluster. Any *one* prober, though, gets to a given node only once per pass, which takes n − 1 rounds: 4 rounds here, but about 1,000 rounds with 1,000 nodes. So one node notices a crash quickly, and the others have to be told (step 5). Each node sends one ping per round, and on average answers one, whatever the size of the cluster.
[▶ n4 crashes at t=35; n3 probes it at t=38 and gets no ack](play:crash@t=38)

**2. Before suspecting, ask others to try (indirect probes).** No ack may only mean the path between the two of you is broken. So the prober picks k = 2 other nodes and sends each a **PingReq** ("ping-request"): "please ping n3 for me". Each helper pings n3 itself and passes any ack back. If any ack returns, along any path, n3 is alive.
[▶ n1 can't reach n3, asks n5 and n4, and hears through n5 that n3 is alive](play:bad link@t=7)
Without helpers, one broken link is enough to get a healthy node declared dead. The naive attempt shows it; it has no helpers and none of the later steps either. (A run that removes *only* the helpers comes after step 5, once the other pieces exist.)
[▶ Broken: the naive version, with no helpers and no suspicion](play:broken: direct pings only@t=7)

**3. Suspect first; declare dead only after a suspicion timeout.** Even when all the helpers fail, the node may just be slow: busy, paused, or briefly cut off. So the prober marks it **suspect** and tells everyone. Any node holding a suspect waits a **suspicion timeout** (60 ticks here, 4 rounds). Only a suspect that stays silent for that long becomes dead. Each node checks its suspects once a round, so in practice it is a little longer. A crashed node never answers, so it still dies, just later.
[▶ n3 marks n4 suspect at t=52, and declares it dead at t=113](play:crash@t=52)
In this run n3 is slow: the next four pings sent to it get no reply. Without suspicion, n1 declares it dead the moment its probe fails, and the whole cluster believes it.
[▶ Broken: no suspicion, so a slow n3 is dead at once](play:broken: no suspicion@t=46)

**4. Let the suspect refute it, using an incarnation number.** Each node keeps an **incarnation number**, a counter about itself that only it may raise. Every rumour carries one: "n3 is suspect, incarnation 0". When n3 hears that rumour, it raises its incarnation to 1 and spreads "n3 is alive, incarnation 1". The rules for which rumour wins:
- a bigger incarnation always wins;
- at the same incarnation, suspect beats alive;
- dead is final.

Why a number, and not just "I'm alive"? Old "alive" messages are still travelling around. If any "alive" cancelled a suspicion, a stale one would clear it, and a crashed node might never be declared dead. Only n3 can raise n3's number, so "alive, incarnation 1" can only have been said by n3 after the suspicion it answers.
[▶ n1 suspects n3 at t=46](play:refute@t=46)
[▶ n3 hears it is suspected and refutes with incarnation 1](play:refute@t=56)
[▶ By t=79 every node lists n3 alive again](play:refute@t=79)
The refutation reached n1 at t=76, 30 ticks before n1's suspicion timeout would have run out. The timeout has to cover the whole trip: the rumour reaching the suspect, and the answer spreading back. With a timeout of only 2 rounds, about a quarter of runs like this one (other random seeds, same slow n3) ended with n3 declared dead.

**5. Spread every change by gossip, riding on the pings and acks.** Telling everyone directly would bring back the n² cost. Instead, each node keeps a short list of recent news. It attaches that news to the next few pings, acks and ping-requests it sends anyway (5 here), and every node that learns something new does the same. News spreads like an infection: the number of nodes that know multiplies every round, so the whole cluster hears in a number of rounds that grows only with log n. That is why this is called **gossip**, or **epidemic** spreading.
[▶ n3 declares n4 dead at t=113; n1, n5 and n2 hear it from gossip by t=135](play:crash@t=113)
Without gossip, every node has to find out for itself by probing the dead node, and suspicions can't spread, so a suspect can never hear that it should refute. Here n3 declares n4 dead at t=113 and tells nobody. When the run ends at t=140, n1, n2 and n5 have each probed n4 themselves and only suspect it.
[▶ Broken: no gossip, and at t=113 only n3 knows](play:broken: no gossip@t=113)

## Why it works now

- **Completeness:** some node probes a crashed node within a round or two on average, and every prober gets to it once per pass. A crashed node never acks, never refutes, and so becomes dead on the list of whoever suspected it. Gossip then carries "dead" to everyone. [▶ All four live nodes list n4 dead by t=135](play:crash@t=135)
- **Accuracy:** a healthy node has to fail a direct probe and k indirect ones, and then stay silent for a whole suspicion timeout, before it is declared dead. A bad link or a short stall is not enough.
- **Why keep the helpers, now that suspicion exists?** Suspicion is a race: the suspect's refutation has to get around before the timeout runs out. Helpers keep a mere bad link from starting that race at all. This run keeps suspicion, refutation and gossip, and removes only the indirect probes. Across the bad link, n1 suspects n3 at t=7. n3 refutes at t=57, but it can't reach n1 directly, and the refutation still hasn't reached n1 by gossip when n1 next checks its suspects at t=77, 70 ticks after suspecting. [▶ Broken: no indirect probes, so n1 suspects n3 after one missed ack](play:broken: no indirect probes@t=7) [▶ …and declares it dead at t=77](play:broken: no indirect probes@t=77)
- The visualizer checks after every event that no running node is on anyone's list as dead. It holds through a broken link [▶ see it hold](play:bad link@t=11), and breaks when suspicion is removed [▶ see it break](play:broken: no suspicion@t=46).
- This is "rare", not "never". On an unreliable network no failure detector can be perfect. A node silent for longer than the suspicion timeout really is declared dead, whether it crashed or not.

## What it costs

- **Detection delay.** Here n4 crashes at t=35 and the last live node hears it is dead at t=135: one round to be probed, the suspicion timeout, then gossip. A shorter suspicion timeout means faster detection and more false positives.
- **False positives under load.** A node that is overloaded, or paused for longer than the suspicion timeout, is declared dead even though it is running. The prober can be the slow one too: a node that is too busy to read acks in time will suspect healthy peers.
- **Messages per failed probe.** Each failed direct probe costs up to 4k extra messages: k requests, k pings, k acks and k relayed acks.
- **Views disagree for a while.** Between t=113 and t=135 some nodes list n4 dead and others still list it suspect. Membership from gossip is eventually consistent, not agreed on at a single moment.

## Staff notes

- **Not consensus.** Gossip membership is fine for routing requests or balancing load. It is not safe on its own for choosing exactly one leader or lock holder, because two nodes can hold different views at the same moment. Use Raft (lesson 020) or leases with fencing tokens (lesson 023) for that.
- **Rejoining.** Here "dead" is final. A node that was wrongly declared dead has to rejoin the cluster, for example with a higher incarnation number or a new identity.
- **Tuning.** Set the round length, the ack timeout, k and the suspicion timeout from measured round-trip times. Gossip needs more rounds to reach everyone in a bigger cluster, so the suspicion timeout should grow with cluster size; memberlist, for example, scales it with the logarithm of the number of nodes; for a small cluster its default is 4 probe intervals, the value used here.
- **Lifeguard.** HashiCorp observed that many false positives were caused by a slow prober rather than a slow target. Their Lifeguard extensions make a node that is struggling to get its own probes answered slower to accuse others.
- **Phi-accrual.** Instead of a yes/no timeout, a phi-accrual detector keeps a history of heartbeat arrival times and outputs a suspicion level. Each application picks the level at which it acts.

## Check yourself

- **Q:** n1 can't reach n3, but every other node can. What happens to n3?
  A: n1's direct ping fails, so it asks two other nodes to ping n3. Their acks come back through them, and n3 is never even suspected. [▶ See it](play:bad link@t=7)
- **Q:** Why mark a node suspect instead of declaring it dead straight away?
  A: Because a slow node and a dead node look the same. Suspicion gives a slow node time to hear the rumour and refute it. Without it, a node that missed a few pings is dead for good. [▶ See it](play:broken: no suspicion@t=46)
- **Q:** n3 hears "n3 is suspect, incarnation 0". Why does it raise its number instead of just saying "I'm alive"?
  A: A bare "alive" can't be told apart from old "alive" messages still on the wire. A bigger incarnation that only n3 can produce beats the suspicion under the precedence rules, so every node switches back to alive. [▶ See it](play:refute@t=56)
- **Q:** Suspicion and refutation already save a slow node. Why still send indirect probes?
  A: Suspicion is a race between the timeout and the refutation getting around. Across a bad link, the suspect can't answer the accuser directly, so it can lose that race. Helpers stop a bad link from starting the race at all. [▶ See it](play:broken: no indirect probes@t=77)
- **Q:** n3 notices n4 has crashed. How do the other nodes find out, without n3 messaging each of them?
  A: The news rides on the pings and acks n3 sends anyway, and every node that hears it passes it on. Without that, each node has to probe n4 itself, so at t=113 only n3 knows. [▶ See it](play:broken: no gossip@t=113)

## Deep dive

- "SWIM: Scalable Weakly-consistent Infection-style Process Group Membership Protocol" (Das, Gupta and Motivala, 2002) introduces the random probing, ping-req, suspicion with incarnation numbers, and piggybacked dissemination used here.
- HashiCorp's memberlist library implements SWIM with extensions, and Serf and Consul use it for membership and failure detection. "Lifeguard: Local Health Awareness for More Accurate Failure Detection" (Dadgar, Phillips and Currey, 2018) describes their changes.
- Cassandra spreads cluster state by gossip and uses a phi-accrual failure detector, from "The φ Accrual Failure Detector" (Hayashibara and others, 2004).
