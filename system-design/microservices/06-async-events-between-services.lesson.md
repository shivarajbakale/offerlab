# Async events between services

## What it is

- **What it is:** Instead of calling another service and waiting, a service publishes a message saying what happened ("order 42 was placed") to a broker: a system that stores messages until each interested service reads them.
- **The problem it solves:** When every service an order touches must answer before the user does, any one of them being down fails every order, even the receipt email or the dashboard. Publishing an event takes that work off the request path, so an outage becomes a backlog that catches up later.
- **Reach for it when:** Part of the work does not change the user's answer (receipts, analytics, search indexing, notifications), several services want to hear about the same thing, or a downstream service is slow or often down.
- **Not the right tool when:** The user's answer depends on the result, such as stock reserved or payment taken: keep that call synchronous, or coordinate the steps with a [saga](#/sd-microservices/07-saga-orchestration). If the database write and the publish can disagree after a crash, add a [transactional outbox](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer).
- **Where you'll meet it:** Apache Kafka topics with one consumer group per service; RabbitMQ; Amazon SNS topics fanned out to SQS queues; Martin Fowler's essay "What do you mean by Event-Driven?"; "Design a notification system" and "Design checkout" interviews.

## Words we'll use

- **Synchronous call** — one service sends a request to another and waits for the answer before it carries on. Both must be up at that moment.
- **Request path** — every step a request must finish before the user gets an answer.
- **Event** — a message that says something happened ("order 42 was placed"). The sender does not ask anyone to do anything and does not wait for anyone.
- **Publish** — send an event to a broker. Here that takes under a millisecond and returns at once.
- **Broker** (message queue) — a separate system that stores messages durably (until they are handled, or, in Kafka, for a set retention period whether handled or not). Kafka, RabbitMQ and SQS are brokers.
- **Consumer** — a worker that takes messages off a queue and handles them. A **consumer group** is the set of consumers for one service; each group gets its own copy of every event.
- **Backlog** — messages waiting to be handled.
- **Temporal decoupling** — the sender and the receiver do not need to be up at the same time. The broker holds the message in between.
- **Eventual consistency** — another service's copy of the facts is behind for a while, but catches up once the messages in flight are handled.
- **At-least-once delivery** — every message is handled, but some may be handled twice (after a failure, the broker hands it out again). A consumer that gives the same result when it handles a message twice is **idempotent**.
- **Visibility timeout** — after a consumer takes a message, the broker hides it from other consumers for a while. If the consumer does not say "done" in time, the message becomes visible again and is retried. Here that is 1 s. This is SQS's model; Kafka consumers instead retry in place on their partition, or move the message to a retry or dead-letter topic.

## The world we're in

- A shop takes 1,000 orders a second. We time requests from our own edge, 1 ms from the user.
- Placing an order touches four services: **Orders** (writes the order), **Inventory** (reserves the items), **Email** (sends the receipt through an outside email provider, 10 ms away), and **Analytics** (records the sale for dashboards).
- The user needs to know two things: the items were reserved, and the order was saved. The receipt can arrive a few seconds later. The dashboard can be a few seconds behind.
- Services fail. Here Analytics goes down for 3 seconds (both its machines, a bad deploy) and then comes back.

## The goal

Keep taking orders when a service the user does not need right now is down, without losing the work that service was supposed to do.

## The naive attempt

"Orders calls Inventory, writes the order, then calls Email and Analytics, and answers when all four are done."

While everything is up this works. An order takes about 47 ms, most of it waiting on the email provider, a hop that has nothing to do with the user's answer.
[▶ The chain: about 47 ms per order](play:chain: every@t=2)

At 3 s Analytics goes down. Orders' call to it is refused, so Orders fails the request. Every order fails for 3 seconds. Look at the database: it still takes about 1,000 writes a second. Each "failed" order was saved before the Analytics call broke. A user told it failed may press Buy again, and then there are two orders. (The simulator does not model those second clicks.) Then the outage ends and everything is fine again, as if nothing happened, except for users who think their order failed, and duplicates from those who try again.
[▶ Broken: Analytics down, every order fails](play:broken: chain@t=4)

The chain made the order depend on the least important service. It also made "the order happened" and "the user was told it happened" disagree.

## Building it up

**1. Split the work by who needs it now.** The user's answer depends on Inventory (are the items reserved?) and the database (is the order saved?). It does not depend on the receipt being sent this millisecond, or on the dashboard. Those two stay synchronous; the other two leave the request path.

**2. Publish one event, give each consumer its own copy.** Orders publishes "order placed" and answers. The broker keeps one queue per consumer group: one for Email, one for Analytics. Each group reads at its own pace, so a slow or dead consumer only delays its own queue. (In Kafka this is one topic with two consumer groups; with SNS and SQS, one topic fanned out to two queues. Lesson 027 shows how Kafka spreads one group's work over partitions.) An order now takes about 18 ms.
[▶ Publish an event: about 18 ms per order](play:publish: orders@t=2)

**3. Watch the same outage.** At 3 s Analytics goes down. No order fails: Orders never talks to Analytics. Email's queue does not notice either. The Analytics queue is where the outage lands. Its consumers keep trying, every delivery is refused, and each failed event is hidden for 1 s (the visibility timeout) and then retried. For the first second that costs little: the consumers are busy about 60% of the time, and the ~1,000 held events are hidden, waiting out their timeout. But every held event comes back once a second for another doomed attempt, on top of the 1,000 new ones. A refused delivery still takes a consumer about 3 ms, so 5 consumers manage about 1,650 attempts a second. Soon after 4 s they are busy all the time failing retries, and events start waiting in plain sight as well. At 5 s the queue holds about 2,000 events, a few hundred of them visible. The oldest visible one was first published about 1.2 s earlier, and its age keeps growing: a retry does not reset a message's age.
[▶ No failed orders; the Analytics queue holds the outage](play:broken: publish@t=5)

**4. Count the cost of catching up.** At 6 s Analytics is back. Within a second every hidden event is visible again: about 2,700 are waiting. Now the question is how fast the consumers can work through them. Each job takes about 4 ms (1 ms of its own, then a call to Analytics), so 5 consumers finish about 1,250 a second. New orders still arrive at 1,000 a second. Only about 250 a second are left over for the backlog, so after five more seconds about 1,500 are still waiting. Analytics' dashboards are many seconds behind, and a second outage before it catches up would stack on top.
[▶ Broken: the backlog peaks at 7 s](play:broken: publish@t=7)
[▶ And is still most of the way there at 12 s](play:broken: publish@t=12)

**5. Size consumers for catch-up, not for the steady rate.** The time to drain a backlog is the backlog divided by the spare rate:

  catch-up time = backlog ÷ (consumer capacity − arrival rate)

With 5 consumers that is 2,700 ÷ 250 ≈ 11 s. With 30 consumers (about 7,500 jobs a second, as long as Analytics itself can take them), it is 2,700 ÷ 6,500, under half a second. Consumers are cheap; the 25 extra cost about $0.04 an hour here.
[▶ Thirty consumers: the backlog is gone within a second](play:room to catch up@t=7)

## Why it works now

A synchronous call needs both sides up at the same moment, so every service on the request path multiplies the chance an order fails.
[▶ Broken: one service down, every order failing](play:broken: chain@t=5)
An event needs only the broker to be up when it is published. The consumer can be down; the broker holds the event until it is back. The outage turns from failed orders into a backlog, and enough spare consumer capacity turns the backlog into a short delay.
[▶ The same outage as a short backlog](play:room to catch up@t=6)

## What it costs

- **Eventual consistency.** Analytics, and the receipt, are behind by however long the backlog takes to drain. Anything that must be true before the user's answer (stock reserved, order saved) cannot be an event.
- **A broker to run.** It must be durable and highly available, or it becomes the new single point of failure. Here the queue and consumers add about $0.30 an hour.
- **Duplicates.** Brokers deliver at least once. A consumer that crashes after doing the work but before saying "done" gets the message again. Email must not send two receipts: it should remember which order ids it has handled (an idempotent consumer, lesson 026).
- **Publishing is a second write.** "Save the order" and "publish the event" are two systems. If Orders crashes between them, the order exists and nobody hears about it, or the reverse. The fix is the transactional outbox (lesson 026): write the event into the same database transaction as the order, and publish it from there.
- **What the simulator leaves out.** It does not model the broker failing, duplicate deliveries, or ordering. Events here are handled roughly in order; real brokers keep order only within a partition or queue, and retries can reorder them.

## Staff notes

- For each call on the request path ask: does the user's answer depend on it? If not, publish an event.
- Alert on the age of the oldest message per consumer group, not the queue length alone. Age is how far behind that service is. Watch retries too: a consumer hammering a dead service is a sign to back off.
- Size consumers for catch-up time after your longest likely outage, and check the downstream service can take the catch-up rate, or the catch-up becomes its own outage.
- Events describe facts in the past tense ("order placed"), not commands ("send email"). The publisher should not know who listens; new consumers can subscribe without changing Orders.
- Do not hide a required step behind an event to look decoupled. If the order must not be placed without a payment, the payment is on the request path, or the whole flow becomes a saga (lesson 07).

## Check yourself

- **Q:** In the chain, Analytics was down for 3 seconds. Why is "every order failed" not the whole damage?
  A: The orders had been written before the Analytics call broke, so users were told "failed" about saved orders and may buy again, creating duplicates. [▶ Show it](play:broken: chain@t=4)
- **Q:** With events, where did the Analytics outage go?
  A: Into the Analytics queue: its backlog grew while Orders and Email carried on untouched. [▶ Show it](play:broken: publish@t=5)
- **Q:** Five consumers handle 1,250 jobs a second and orders arrive at 1,000. Why does a 2,700-event backlog take about 11 seconds to drain?
  A: Only the spare 250 a second goes to the backlog: 2,700 ÷ 250 ≈ 11 s. [▶ Show it](play:broken: publish@t=12)
- **Q:** What changed so the same outage drained in under a second?
  A: Thirty consumers: about 6,500 jobs a second of spare capacity instead of 250. [▶ Show it](play:room to catch up@t=7)
