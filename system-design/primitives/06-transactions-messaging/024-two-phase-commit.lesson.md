# Two-phase commit

## What it is

- **What it is:** A protocol that makes one change spanning several databases happen everywhere or nowhere. A coordinator first asks every participant "can you do your part?", and only if all say yes does it tell them all to commit.
- **The problem it solves:** When one action changes data in several services, each with its own database, one can fail after the others have already made their part final, leaving the action half done: an item taken that nobody paid for. Two-phase commit has everyone promise before anyone commits.
- **Reach for it when:** A few databases or resources you control must change together atomically, they support a prepare step (XA, or PostgreSQL's `PREPARE TRANSACTION`), and holding locks for a round trip, or longer if the coordinator fails, is acceptable.
- **Not the right tool when:** The services belong to other teams or companies, or a dead coordinator stalling everyone's locks is unacceptable; use a [saga](#/sd-06-transactions-messaging/025-saga-with-compensation). To save data and publish an event together, use a [transactional outbox](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer).
- **Where you'll meet it:** The XA standard and Java's JTA; PostgreSQL's `PREPARE TRANSACTION` and `COMMIT PREPARED`; Google Spanner, which runs two-phase commit across Paxos groups. Kleppmann's DDIA, chapter 9. It is the standard follow-up to "how do you keep three services consistent?"

## In plain words

A customer orders the last lamp in the shop. Three separate programs must each do their bit: inventory takes the lamp out of stock, payments charges the card, and orders records the order. Each keeps its own database, so no single "save" button covers all three. If the card is declined after the lamp has already left stock, the shop has given the lamp away. We need all three to happen, or none.

Think of a wedding. The officiant asks each person "do you?" first, and only when both have said yes does the officiant declare them married. Nobody is half married. Two-phase commit works the same way: a coordinator first asks every service "can you do your part?" (phase 1, prepare and vote), and only when everyone has promised does it say "do it" (phase 2, commit). One "no" and it says "cancel" instead.

In the picture on the right, the coordinator, the three services and the customer (client) sit on a circle. Each moving dot is a message, labelled `Prepare`, `Vote`, `Commit`, `Abort` or `Status`; a ✗ marks a lost message, and a crashed node reads "down". Under each node a short label says its job and where it stands, such as "prepared: voted yes · locked for T1". The table underneath shows each service's `status` (idle, prepared, committed, aborted), `lockedBy` (which order holds its lock) and `available` (lamps, money or order slots left), with changed cells highlighted. The box at the top says what just happened, in green when things went right and in red when the order has been damaged.

## Words we'll use

- **Service** — a program that owns its own database. Here there are three: **inventory** (items in stock), **payments** (money on the customer's card) and **orders** (the order records).
- **Transaction** — a group of changes that belong together. Here it is T1, "sell one item": take an item from stock, charge the card, and record the order.
- **Atomic** — all or nothing. Either every change in a transaction happens, or none does. A half-done transaction (item gone, card not charged) is the bug we are trying to prevent.
- **Unit** — the one thing each service sets aside for T1: an item, the money, an order slot. A service with no unit to give can't do its part.
- **Commit** — make the transaction's changes final. **Abort** — cancel them. **Roll back** — undo whatever a service had set aside, which is what it does on abort.
- **Participant** — a service taking part in the transaction.
- **Coordinator** — the one node that runs the transaction: it asks the participants, makes the decision, and tells everyone.
- **Lock** — a mark that says "this unit is reserved for T1". While it is held, any other request for that unit is turned away.
- **Vote** — a participant's answer to "can you do your part?": yes or no.
- **Prepared** — the state of a participant that has voted yes: its unit is locked, and it has promised to commit if told to.
- **Durable** — written to disk, so it survives a crash.
- **Log** — the coordinator's record on disk of which transaction it started and what it decided.
- **Crash** — a node stops. When it restarts, its memory is gone; only what it wrote to disk survives.
- **Blocked** — stuck: unable to move forward and unable to give up, holding locks the whole time.
- **Round trip** — a message sent and its reply received: here, `Prepare` out to a participant and its vote back.
- **Tick** — one unit of simulated time. `t=7` means tick 7. Here every message takes 2 ticks to arrive.

## The world we're in

- One customer action changes data in three services, each with its own database. No single database can make the whole change atomic.
- Messages take time, and some are lost.
- Nodes crash and restart at any moment. A restart wipes memory; the disk survives.
- A node can't tell "the coordinator is dead" from "the coordinator's messages are slow".
- Nodes are honest: they run the protocol as written.

## The goal

T1 commits at every participant or aborts at every participant, never a mix, even when messages are lost and the coordinator crashes.

## The naive attempt

"The coordinator tells every service to commit."

Each service does its part as soon as the message arrives. But what if one of them can't? Here the card has no money. Inventory and orders have already taken the item and recorded the order by the time payments finds out it can't charge the card. The client was told "done". The item is gone and nobody paid for it.
[▶ Broken: at t=3 inventory and orders commit, and payments can't](play:broken: no prepare@t=3)

The root problem: by the time anyone learned that payments couldn't do its part, the others had already done theirs and there was no going back.

## Building it up

**1. Ask first, then decide: two phases.** In phase one the coordinator sends `Prepare` to every participant: "can you do your part?". Nobody changes anything final yet; each participant only checks and votes. In phase two the coordinator decides. If every vote is yes, it sends `Commit`. If even one vote is no, it sends `Abort`, and everyone rolls back. That fixes the naive attempt: payments says no before anyone has done anything final.
[▶ payments votes no at t=3, and at t=7 everyone rolls back](play:abort@t=3)
[▶ All three vote yes at t=3, and at t=7 everyone commits](play:commit@t=3)
Silence is not a yes. If a vote never arrives, the coordinator waits a while and then aborts. Before it has decided, aborting is always safe, because nobody has committed.

**2. A yes vote is a promise.** Voting yes means "if you tell me to commit, I will be able to". To keep that promise, the participant locks its unit before voting, so nothing else can take it in the meantime. It also writes "prepared", with the lock, to disk, so a crash can't make it forget the promise. Without the lock, the promise is empty. Here inventory votes yes but locks nothing. Another order takes the last item at t=4. When `Commit` arrives at t=7, inventory hands over an item it no longer has: stock goes to −1, and the same item has been sold twice.
[▶ Broken: inventory votes yes at t=3 without a lock, and the item is sold twice](play:broken: no locks@t=3)

**3. Once prepared, a participant waits for the decision.** A participant that voted yes doesn't know the outcome. Someone else may have voted no, so the answer is abort. Or everyone voted yes and the coordinator already wrote "commit", so the answer is commit. Only the coordinator saw every vote. So a prepared participant can't decide on its own. It can only keep asking the coordinator "what was decided?" and hold its lock until it hears back. (A participant that votes no is different: it knows the outcome must be abort, so it rolls back at once.)
Here payments votes no, and the coordinator decides abort. The coordinator crashes at t=6, and its `Abort` to inventory is lost at t=7.
[▶ Broken: the Abort to inventory is lost at t=7](play:broken: a participant gives up@t=7)
inventory asks twice, gets no answer, and gives up. Guessing "everyone voted yes, so probably commit", it commits. payments and orders have rolled back. T1 is now half done.
[▶ Broken: at t=33 inventory commits on its own while the others aborted](play:broken: a participant gives up@t=33)

**4. The coordinator writes its decision to disk before telling anyone.** Step 3 makes everyone depend on the coordinator's answer, so that answer must never change, even across a crash. Here the coordinator decides commit and crashes at t=6. At t=7 inventory and payments commit, but the `Commit` to orders is lost. It kept its decision only in memory, so it restarts at t=20 with nothing.
The coordinator follows a rule called **presumed abort**: if it has no record of a transaction, it answers "abort". The rule is meant to be safe because a commit is never sent before it is on disk, so "no record" should mean "never committed". Here that is not true, because the decision was never written. When orders' question reaches it at t=25, the coordinator has no record of T1 and presumes abort. orders rolls back, while the other two have committed.
[▶ Broken: the restarted coordinator forgets that it decided commit](play:broken: decision not on disk@t=20)
With the decision on disk, the restarted coordinator reads "commit" from its log and sends it again. orders, still prepared and still holding its lock, commits.
[▶ The coordinator restarts at t=20, reads "commit" from its log, and finishes T1](play:recovery@t=20)
If the log shows that T1 started but holds no decision, the coordinator crashed while still collecting votes. Those votes were only in memory. Nobody can have committed, because commit is only ever sent after "commit" is on disk. So it decides abort and tells everyone.
[▶ The coordinator restarts with no decision for T1, so it aborts](play:restart before deciding@t=20)

## Why it works now

- Nobody does anything final until everyone has voted, so a participant that can't do its part stops the transaction before any damage is done.
- A yes vote is backed by a lock and is written to disk, so a participant that said yes can always commit later.
- The coordinator decides exactly once, and writes the decision to disk before sending it. That write is the moment T1 commits or aborts. Every later message, resend and restart repeats the same answer.
- A prepared participant never decides alone, so it can't contradict the coordinator.
- The visualizer checks after every event that no transaction is committed at one participant and aborted at another, and that no unit is given away twice. It holds through lost messages and a coordinator restart [▶ see it hold](play:recovery@t=7), and breaks the moment a participant decides on its own [▶ see it break](play:broken: a participant gives up@t=33).

## What it costs

- **Blocking.** If the coordinator dies after the participants voted yes, they are stuck. They can't commit and they can't abort, so they keep their locks until the coordinator comes back, however long that takes.
[▶ The coordinator is down; the participants keep asking and keep holding their locks](play:blocked@t=13)
Those locks block other work. Another order for the same item is turned away while T1 sits in prepared.
[▶ At t=30 another order for the item is told "busy"](play:blocked@t=30)
- **Latency.** Before the client hears "done" there is one round trip to collect the votes, a disk write at every participant before it votes yes, and a disk write at the coordinator for its decision. Then the answer takes one more hop to the client. The `Commit` messages travel at the same time, so the second phase finishes at the participants as the client hears the outcome: here, both at t=7.
[▶ The client hears the outcome at t=7](play:commit@t=7)
- **Locks held for the whole protocol.** Each unit stays locked from prepare until the decision arrives, so busy items become a bottleneck.
- **The coordinator is a single point of failure** for every transaction it is running.

## Staff notes

- **XA** is the standard interface for two-phase commit between a transaction manager (the coordinator) and resource managers such as databases and message brokers (the participants). Java's JTA uses it.
- **Heuristic decisions.** Real systems let an operator, and some resource managers on their own, force a stuck prepared transaction to commit or roll back. That is exactly the broken "gives up waiting" scenario, which is why XA has a "heuristic mixed" error: atomicity may have been lost and someone must clean up by hand.
- **Why microservices avoid 2PC.** It makes every service hold locks on behalf of a coordinator it doesn't own. One slow or dead coordinator stalls all of them. And not every datastore or message broker supports XA. The usual alternative is a **saga** (lesson 025): each step commits locally, and a failure is undone by running compensating steps. That gives up atomic isolation for availability.
- **Fixing the blocking.** The coordinator blocks everyone because its log lives on one machine. The fix is **consensus**: a group of nodes agreeing on one value, such that the agreement survives some of them failing (lessons 020 and 021 build it with Raft; **Paxos** is an older algorithm that does the same job). In Google Spanner each participant is a Paxos group, a few machines that keep identical copies of their data and log by agreeing on every change. One of those groups acts as coordinator, so if one machine dies another copy of the log carries on. Paxos Commit (Gray and Lamport) replaces the single coordinator's decision with consensus among several nodes, so no single failure blocks it.
- **Three-phase commit** adds a round to avoid blocking, but it relies on bounded message delays, and a network partition can make it reach different decisions on each side.
- Monitor for transactions that stay prepared. They hold locks that block unrelated work until someone resolves them.

## Check yourself

- **Q:** payments votes no. What do inventory and orders, which voted yes, end up doing?
  A: They roll back. One no means the coordinator writes "abort" and tells everyone. payments already rolled back on its own, because it knew the outcome. [▶ See it](play:abort@t=5)
- **Q:** The coordinator crashes after everyone voted yes but before anyone heard the decision. Can inventory release its lock and move on?
  A: No. It doesn't know whether the coordinator wrote "commit" or never decided at all. Either guess could contradict the others, so it holds the lock and keeps asking. [▶ See it](play:blocked@t=13)
- **Q:** Why must the coordinator write "commit" to disk before sending any `Commit`?
  A: Because some participants may commit as soon as it is sent. If the coordinator then crashes and forgets, it will answer "abort" to anyone who asks, and the transaction ends up half committed. [▶ See it](play:broken: decision not on disk@t=25)
- **Q:** A restarted coordinator finds T1 in its log with no decision. Why is abort safe?
  A: `Commit` is only ever sent after "commit" is on disk. No decision on disk means nobody can have received a commit, so everyone can still roll back. [▶ See it](play:restart before deciding@t=20)
- **Q:** Why lock the unit at prepare time instead of at commit time?
  A: A yes vote is a promise to be able to commit. Without a lock, another request can take the unit between the vote and the commit, and the promise can't be kept. [▶ See it](play:broken: no locks@t=4)

## When to use which

- **One database transaction** — when all the data lives in one database. This always beats anything on this page: if you can put orders, stock and payments in one database, do.
- **Two-phase commit (this lesson)** — when a few databases you control must change together right now, all or nothing, and they support a prepare step. Example: moving money between two bank-account shards in the same company, or a cross-shard write in Spanner. You pay with locks held for two round trips and a stall if the coordinator dies.
- **[Saga with compensation](#/sd-06-transactions-messaging/025-saga-with-compensation)** — when the steps belong to different services or companies (a card processor, a shipping partner), take seconds or minutes, or must never be stalled by someone else's coordinator. Each step commits on its own and a failure is undone by a "refund" step. Example: an online order that reserves stock, charges the card and books a courier.
- **[Transactional outbox](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)** — when the only "second system" is a message you must publish after saving to your own database, such as "OrderPlaced" for the email and shipping services. No coordinator, no locks across services.
- **Consensus underneath ([Raft](#/sd-05-replication/021-raft-log-replication))** — when the coordinator itself must not be a single point of failure. Spanner runs 2PC with each participant and the coordinator replicated by Paxos, so a crash does not block anyone.
- **In an interview:** say "2PC gives atomicity but blocks if the coordinator dies, so across microservices I'd use a saga, plus an outbox to publish events reliably".

## Deep dive

- PostgreSQL exposes the participant side directly. `PREPARE TRANSACTION` makes the prepared state durable and keeps its locks. `COMMIT PREPARED` or `ROLLBACK PREPARED` finishes it later, even after a restart. Its documentation warns against leaving prepared transactions open, because they keep holding locks.
- "Designing Data-Intensive Applications" (Martin Kleppmann), chapter 9 (1st edition), covers two-phase commit, XA and why a coordinator failure leaves participants in doubt.
- "Consensus on Transaction Commit" (Jim Gray and Leslie Lamport) describes Paxos Commit.
- The Spanner paper (Corbett et al., OSDI 2012) describes two-phase commit run across Paxos groups.
