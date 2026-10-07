# Kafka partitions and consumer groups

## What it is

- **What it is:** Kafka is a message broker that stores each named stream, a topic, as several append-only logs called partitions. Messages with the same key go to the same partition (as long as the partition count stays the same), and a consumer group splits the partitions among its members, each reading from a saved position.
- **The problem it solves:** One consumer can't keep up with a busy stream, but spreading messages over several consumers without care lets one user's messages be processed out of order, and a crashed consumer can lose or repeat work. Partitions chosen by key, each with one owner, keep order per key while spreading the load.
- **Reach for it when:** A high-volume stream of events that several services need to read, at their own pace and possibly again later, where order matters per key: payments per account, readings per device, changes per row.
- **Not the right tool when:** A plain work queue where any worker takes any job and order doesn't matter; a queue such as Amazon SQS or RabbitMQ is simpler. Also when a single key is too busy for one consumer, since one key always lives in one partition.
- **Where you'll meet it:** Apache Kafka's documentation on partitions, offsets and consumer groups; Amazon Kinesis Data Streams, whose shards and partition keys play the same role; Kleppmann's DDIA, chapter 11. Event pipelines in interviews such as "Design a news feed" or "Design a metrics pipeline".

## In plain words

A busy app produces a constant stream of events: alice clicked buy, bob changed his address, alice paid. Several services want to react to them, and one reader can't keep up, so the work has to be shared between several readers. Two things must not break while sharing: one user's events must still be handled in the order they happened (alice's "paid" after her "clicked buy"), and when a reader crashes, its events must not be lost or quietly skipped.

Think of a bank with several tellers and a numbered ticket line per surname letter. Every customer whose name starts with A always joins line A, so their visits are served in order; each line has exactly one teller at a time; and each teller writes down the last ticket number they finished. If a teller goes home sick, the manager hands their line to another teller, who carries on from the last number written down. Kafka is that: the lines are partitions, the tellers are consumers in a group, the manager is the broker, and the written-down number is the committed offset. Unlike a queue, the tickets are never thrown away, so the line can be read again later.

In the picture on the right, the broker sits with the consumers (c1, c2, ...) and the producer (client) on a circle. Dots are messages: `Produce` (a new event), `Fetch` and `Records` (a consumer reading), `Commit` (saving its bookmark), `Heartbeat` ("I'm alive"), and the reshuffle messages `JoinGroup`, `Revoke`, `Rejoin` and `Assign`; a crashed consumer reads "down". Under each node a short label says where it stands: the broker shows who owns each partition and the bookmarks (such as "p0→c1 p1→c2 p2→c3 · bookmarks 3/1/2"), and each consumer shows what it reads and what is next in its queue. The table underneath shows the broker's three partition `logs` (p0, p1, p2, each a list like `alice#1`), the `committed` bookmark per partition, the group `members`, which consumer is the `owner` of each partition, and the `generation` (how many reshuffles so far). Each consumer row shows the `partitions` it owns, messages `buffered` but not yet processed, the ones it has `done`, and how far it has `processed`. The box at the top says what just happened, in red when order breaks or messages are lost or repeated.

## Words we'll use

- **Message** — one event, such as "alice paid 5". Here each message has a **key** (alice) and a number (alice#1, alice#2, …) that shows the order it was sent in.
- **Producer** — a program that sends messages. Here the producer is the client.
- **Consumer** — a program that reads messages and **processes** them: sends an email, writes a row, and so on.
- **Broker** — the server that stores the messages and hands them to consumers.
- **Log** — a list you can only add to at the end. Reading it does not remove anything.
- **Offset** — a message's position in a log: 0, 1, 2, … It never changes, so "read from offset 2" always means the same messages.
- **Topic** — a named stream of messages, such as "payments".
- **Partition** — one of several separate logs that together make up a topic. Here the topic has 3: p0, p1 and p2.
- **Hash** — a function that turns a key into a number, always the same number for the same key. "Hash the key, mod 3" (the remainder after dividing by 3) picks a partition: 0, 1 or 2.
- **Consumer group** — consumers that share the work of reading one topic. Each partition is read by exactly one member at a time, its **owner**.
- **Tick** — one unit of simulated time. A message between two machines takes one to three ticks to arrive; times below are written t=17 and so on.
- **Fetch** — a consumer asking the broker for the next few messages of a partition, starting at a given offset. The messages one fetch returns (here up to 3) are a **batch**.
- **Committed offset** — the group's bookmark for a partition, kept by the broker: the offset of the next message the group still has to process.
- **Heartbeat** — a small "I'm still alive" message a consumer sends the broker every few ticks.
- **Session timeout** — how long the broker waits without a heartbeat before it decides a consumer is dead.
- **Rebalance** — the broker taking the partitions back from everyone and dealing them out again.
- **At-least-once** — every message is processed, but some may be processed twice. **At-most-once** — no message is processed twice, but some may never be processed.

## The world we're in

- Producers send a steady stream of messages. One consumer alone can't keep up with them.
- Consumers crash, and new consumers are started when traffic grows.
- Messages about the same key must be handled in the order they were sent: alice's "open account" before her "deposit".
- Messages take a variable amount of time to arrive. There is no shared clock.
- The broker keeps its logs and the committed offsets on disk.

## The goal

Several consumers share the work. Each key's messages are processed in the order they were sent. When a consumer crashes, or a new one joins, no message is lost.

## The naive attempt

"Split the stream into 3 logs and deal the messages out in turn, one log per consumer. Three consumers work in parallel, so it's three times as fast."

It is faster, but alice's messages now sit in different logs, read by different consumers, each working at its own speed. Nothing makes alice#3 wait for alice#2. Here alice#2 is first in line in p2, but c3's first batch reaches it at t=16, three ticks after c2's. So c2 finishes alice#3 at t=17, and c3 finishes alice#2 only at t=18.
[▶ Broken: dealing messages out in turn, so alice#3 is processed before alice#2](play:broken: no key@t=19)

## Building it up

**1. Keep a log, not a queue.** A classic message queue (RabbitMQ, JMS, Amazon SQS) hands each message to one consumer and deletes it once that consumer acknowledges it, that is, says "done". A consumer that crashes before acknowledging doesn't lose the message: the queue hands it out again. What a queue can't do is go back. Once a message is acknowledged it is gone, so a bug fix can't be replayed over last week's messages, and a second service that wants the same messages needs its own copy of the queue. Order is weak too: when several consumers share a queue and one of them crashes, its message is handed out again, but by then the others may have processed newer messages, so it ends up processed after them.
A log fixes all three. Nothing is deleted when it is read; each reader just remembers an offset. So a group can go back and read again, any number of groups can read the same log at their own pace without copying it, and a message handed out again comes back at its own offset, in its original place. Here the broker records that the group has finished p0 up to offset 3, and p0 still holds alice#1 to alice#4. Another group, or this one after a bug fix, could start again at offset 0.
[▶ p0 is processed up to offset 3, and still holds every message](play:ordering@t=27)
When c1 crashes, c2 takes p0 over and reads it from the bookmark in log order, alice#1 first.
[▶ c2 takes over p0 and reads it from offset 0](play:rebalance on crash@t=34)

**2. Split the topic into partitions, and pick the partition by hashing the key.** One log read by one consumer has a speed limit. Several partitions can be read in parallel. The key's hash picks the partition, so every alice message goes to p0, every bob message to p1, and every dave message to p2. Inside one partition, messages keep the order they arrived in.
[▶ The broker appends alice#1 to p0 and bob#1 to p1](play:ordering@t=1)
Order holds only inside a partition, not across the topic. Dealing messages out in turn, without looking at the key, spreads one key over several partitions, and the order check described under "Why it works now" catches it.
[▶ Broken: alice#2 is processed after alice#3](play:broken: no key@t=19)

**3. Form a consumer group, and give each partition exactly one owner.** The broker deals the partitions out in turn over the members, sorted by name: with n members, partition i goes to member number i mod n. One owner per partition means one partition's messages are processed one at a time, in offset order, so alice's messages come out in the order they were sent.
[▶ c1 gets p0, c2 gets p1, c3 gets p2](play:ordering@t=9)
A partition can't be split between two consumers, so a group never has more busy members than partitions. A fourth consumer gets nothing.
[▶ c4 joins, and sits idle](play:idle@t=11)

**4. Commit the offset after processing, not before.** The committed offset is where the next owner starts. So when you commit decides what a crash costs.
Commit before processing, and a crash skips messages: the bookmark says "done" for messages nobody processed. Here c1 fetches alice#1 to alice#3, commits offset 3 at once, processes only alice#1, and crashes.
[▶ Broken: c1 commits before processing](play:broken: commit before@t=15)
[▶ c2 resumes p0 at offset 3 and p2 at offset 2: alice#2, alice#3, dave#1 and dave#2 are lost for good](play:broken: commit before@t=32)
Commit after processing, and a crash repeats messages instead. Here c1 processes dave#1 at t=17 and crashes at t=18, before its next commit at t=24. The bookmark for p2 still says 0, so c2 processes dave#1 again later. That is at-least-once: nothing is lost, but the consumer must cope with duplicates.
[▶ c1 processes dave#1, then crashes before committing](play:rebalance on crash@t=18)
[▶ c2 processes dave#1 a second time](play:rebalance on crash@t=48)

**5. Rebalance when the group changes.** Two events change the group. First, a consumer can die. A broker that never checks for silence leaves a dead consumer's partitions with it. Here c1 crashes at t=18 holding p0 and p2, and nothing in them is processed again.
[▶ Broken: c1 is silent, but keeps p0 and p2, and they go unread](play:broken: no heartbeat@t=28)
So a consumer that sends no heartbeat for a session timeout is removed, and its partitions are dealt out to the others.
[▶ c1 sent no heartbeat for 10 ticks, so it is removed](play:rebalance on crash@t=28)
Second, a new consumer joining should get a share of the work. Either way, the broker starts a rebalance. Every member stops, drops messages it fetched but hasn't processed, and hands in how far it really got. Only when everyone has answered does the broker deal the partitions out again, each from its committed offset. So a partition's new owner starts only after its old owner has stopped reading it.
[▶ c3 joins a running group](play:scale out@t=20)
[▶ c1 and c2 stop and hand in their offsets](play:scale out@t=26)
[▶ c3 takes over p2 from offset 2](play:scale out@t=31)

**6. Number the rebalances.** Each rebalance gets a new **generation** number, and the broker ignores anything stamped with an older one. A commit sent just before a rebalance can arrive in the middle of it, or after it. Without generations, a late commit does damage. Here c3 joins, and c1 commits "p0 is at 1" at t=24, just before the rebalance; the network slows that message down. c1 goes on to process alice#2 and alice#3, and its rejoin sets p0's bookmark to 3. Then the old commit lands at t=35, after the partitions have been dealt out, and moves p0's bookmark back to 1.
[▶ Broken: c1's rejoin sets p0's bookmark to 3](play:broken: no generations@t=32)
[▶ Broken: c1's commit from generation 1 lands late and moves p0's bookmark from 3 back to 1](play:broken: no generations@t=35)
c1 crashes at t=37. c2 takes p0 over from the stale bookmark, offset 1, and processes alice#2 and alice#3 a second time, though c1 had finished them and said so.
[▶ Broken: c2 processes alice#2 again](play:broken: no generations@t=66)
With generations, the broker sees that the commit belongs to generation 1, ignores it, and keeps the offsets from the rejoin. Here c1's commit from generation 1 says p0 is at 1, arrives during the rebalance, and is dropped; c1's rejoin says 2.
[▶ The broker ignores c1's commit from generation 1](play:scale out@t=27)

## Why it works now

- One key always hashes to one partition, a partition has one owner at a time, and the owner processes in offset order. So one key's messages are processed in the order they were sent.
- The log keeps everything, and the next owner starts at the committed offset. The offset is committed only after processing, so a crash can repeat messages but never skip one.
- The visualizer checks after every event that no message is processed for the first time before an earlier message with the same key. Repeats after a crash are allowed. It holds while c1 works through alice [▶ see it hold](play:ordering@t=28), and breaks when the key is ignored [▶ see it break](play:broken: no key@t=19).

## What it costs

- **Rebalances pause the group.** From the start of a rebalance until the new assignment, nobody processes anything. Here the rebalance starts at t=24, and after alice#2 finishes at t=24 nothing is processed until t=36.
[▶ The whole group stops for c3 to join](play:scale out@t=24)
- **A crash is noticed only after a session timeout.** c1 dies at t=18; the broker notices at t=28. Until then its partitions are not read. A shorter timeout fails over faster, but removes consumers that were only slow.
- **Duplicates.** At-least-once means processing must be safe to repeat (lesson 026).
- **Hot partitions.** Every alice message lands on p0. Here c2 and c3 are idle from t=20 while c1 still has alice#4 to do. Adding consumers doesn't help a single busy key: one key is always one partition, with one owner.
[▶ c1 is still busy with alice while the others wait](play:ordering@t=20)

## Staff notes

- **Choose the key for the order you need**, and no finer: per account, per order, per device. Check how skewed it is. A few huge customers make hot partitions.
- **Plan the partition count up front.** The number of partitions caps how many consumers in a group can do work. Adding partitions later changes which partition a key hashes to, so for a while one key's old and new messages are in different partitions, and their order is not guaranteed.
- **Cooperative rebalancing.** The rebalance here stops everyone, which is how Kafka's original ("eager") protocol behaves. Kafka also supports cooperative, or incremental, rebalancing: only the partitions that actually move are paused, and the others keep being read.
- **Delay the first rebalance.** The broker here waits a few ticks after a join so that consumers starting together share one rebalance. Kafka has a broker setting for the same idea, `group.initial.rebalance.delay.ms`, but it delays only the first rebalance of an empty group. The model here waits after every join.
- **Simplifications in this model.** One broker holds every partition and also coordinates the group. Real Kafka spreads partitions over many brokers, copies each partition to several of them, and deletes old messages after a retention period. In Kafka's classic group protocol, one consumer, the group leader, computes the assignment, and the coordinator broker passes it on. In Kafka the request to rejoin carries no offsets: a consumer commits its offsets before rejoining, from its "partitions revoked" callback or through auto-commit. This model passes them inside the Rejoin message instead.
- Kafka's Java consumer can commit automatically every few seconds (`enable.auto.commit`, on by default). It commits offsets of messages that earlier fetches (polls) returned, so it is at-least-once only if the application has finished processing those messages before it polls again. Handing them to another thread and polling straight away breaks that, and a crash can then lose messages, as in the commit-before-processing scenario.

## Check yourself

- **Q:** Three consumers read alice's messages. Why do they still come out in order?
  A: alice always hashes to p0, and p0 has exactly one owner, c1, which processes it one message at a time in offset order. [▶ See it](play:ordering@t=15)
- **Q:** A group has 4 consumers and the topic has 3 partitions. What does the fourth do?
  A: Nothing. Each partition has one owner, so there are only 3 shares of work to hand out. c4 sits idle until another member leaves or dies. [▶ See it](play:idle@t=11)
- **Q:** A consumer processes a message and crashes before committing. What happens to that message?
  A: The next owner starts at the old committed offset, so it processes the message again. That is at-least-once delivery. [▶ See it](play:rebalance on crash@t=48)
- **Q:** What goes wrong if a consumer commits as soon as it fetches?
  A: If it crashes before processing, the bookmark already points past those messages, so the next owner skips them. They are lost for good, which is at-most-once. [▶ See it](play:broken: commit before@t=32)
- **Q:** Why must the producer set a key, instead of just spreading messages evenly?
  A: Without a key, one user's messages land in different partitions, read by different consumers at different speeds, and nothing keeps them in order. [▶ See it](play:broken: no key@t=19)

## When to use which

- **Direct calls (HTTP or RPC)** — when the caller needs an answer right now and there is one receiver: "is this card valid?", "what is the price?". Simplest, but if the receiver is down or slow, the caller fails or waits, and a burst of traffic hits the receiver directly.
- **A queue (Amazon SQS, RabbitMQ)** — when jobs just need doing, by any worker, in any order: resize this image, send this email. Each message goes to one worker and is deleted once done, and adding workers is trivial. It can't replay old messages, and order is weak when several workers share it.
- **A log (Kafka, Kinesis; this lesson)** — when several services need the same stream at their own pace, order per key matters (per account, per order, per device), or you may need to replay history after a bug fix. Example: every order event read by billing, shipping and analytics, each as its own consumer group.
- **Exactly-once vs at-least-once** — a consumer that commits after processing gets at-least-once: a crash repeats a few messages, so make processing safe to repeat with ids, as in the [idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer). Committing before processing gives at-most-once: a crash skips messages, which is only fine for data you can afford to lose, such as metrics. Kafka's "exactly-once" only covers reading from and writing back to Kafka itself.
- **[Transactional outbox](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)** — use it on the producing side when an event must be published if and only if a database change happened (the order saved and "OrderPlaced" in Kafka).
- **[Saga](#/sd-06-transactions-messaging/025-saga-with-compensation)** — when one business action spans services and must be undone on failure; its steps often travel over Kafka topics.
- **In an interview:** say "Kafka topic keyed by user id, so per-user order holds; one consumer group per downstream service; commit after processing and dedupe by event id", and mention that the partition count caps how many consumers can work in parallel.

## Deep dive

- The Apache Kafka documentation, "Design" and "Consumer Configs": partitions as ordered logs, offsets, consumer groups, and the settings `session.timeout.ms`, `heartbeat.interval.ms` and `enable.auto.commit`.
- Kafka's default partitioner hashes the key with murmur2 and takes it modulo the number of partitions. Amazon Kinesis Data Streams uses shards and a partition key in the same role.
- "Designing Data-Intensive Applications" (Martin Kleppmann, 1st edition), chapter 11, compares log-based message brokers with traditional queues.
- Lesson 026 shows how to make a consumer safe against the duplicates that at-least-once delivery creates.
