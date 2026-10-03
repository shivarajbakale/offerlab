# Transactional outbox and idempotent consumer

## What it is

- **What it is:** Two patterns for sending events reliably. A service writes each event into an "outbox" table in the same database transaction as its data, a separate loop publishes those rows to the message broker, and each consumer remembers which events it has handled so a repeat changes nothing.
- **The problem it solves:** Saving to a database and then publishing to a broker are two separate writes, so a crash between them leaves an order saved but never announced, or announced but never saved. The outbox makes both one transaction, and the idempotent consumer absorbs the duplicates that its retries cause.
- **Reach for it when:** A service must change its own data and tell other services about it, such as a placed order that must reach billing, and a lost or doubled event would be a real bug: a missing charge or a double charge.
- **Not the right tool when:** Losing an occasional event is harmless, as with analytics or cache warming; publish directly. When one action must change several services and be undone on failure, you need a [saga](#/sd-06-transactions-messaging/025-saga-with-compensation), which often sends its messages through an outbox.
- **Where you'll meet it:** Chris Richardson's microservices.io pages "Transactional outbox" and "Idempotent consumer"; Debezium's outbox event router, which reads the outbox through change data capture; Stripe's `Idempotency-Key` header, which lets a consumer safely retry its call to an outside payment API. Interview: "Design a payment system".

## Words we'll use

- **Service** — a program that owns one job, here the **order service**, which takes orders, and **billing**, which charges for them.
- **Database** (db) — where a service keeps its data on disk. The order service has its own db.
- **Transaction** — a group of writes to one database that happens all together or not at all. When it finishes, it has **committed**.
- **Crash** — a program stops suddenly. Whatever it was about to do next never happens. What it had committed to disk survives.
- **Event** — a message saying something happened, such as "order o1 was placed, for $30".
- **Message broker** — a separate server that stores events and hands them to whoever needs them. Sending an event to it is **publishing**; the service that receives it is the **consumer**.
- **Ack** (acknowledge) — a reply that says "I have it".
- **Dual write** — writing the same fact to two separate systems, here the db and the broker, one after the other.
- **Outbox** — a table in the order service's own db that holds events waiting to be published. Each row is marked **unsent** or **sent**.
- **Relay** — a loop that regularly **polls** (checks) the outbox, publishes the unsent rows, and marks them sent.
- **At least once** — every event is delivered, but some may be delivered more than once. **At most once** is the opposite: never twice, but some may be lost.
- **Duplicate** — a second delivery of an event that was already delivered.
- **Idempotent** — safe to do twice: doing it again changes nothing. A consumer that ignores duplicates is an **idempotent consumer**. Spotting and dropping duplicates is called **deduping**.
- **Message id** — a name that is the same on every copy of one event, here `o1:placed`. It is how a consumer recognizes a duplicate.
- **Tick** — one unit of simulated time. `t=7` means tick 7. Here every message takes 1 tick to arrive.

## The world we're in

- There are four servers: the order service, its db, the broker and billing. Each can crash and restart on its own.
- The db and the broker are different systems. There is no transaction that covers both: each commits on its own.
- Messages take time, and a message sent to a server that is down is lost.
- A crash can land between any two steps of a program, including right between "save" and "publish".

## The goal

Every saved order is charged exactly once, and nothing is charged that was never saved. The order service must not lose the event, and billing must not apply it twice, whatever crashes.

## The naive attempt

"Save the order to the db, then publish the event to the broker."

The two writes are separate steps, and a crash can land between them. Here the db commits o1 at t=2. At t=3 the order service crashes, just as the db's "saved" reply arrives, so it never publishes. When it restarts, nothing records that a publish was still owed. The order exists, and billing never hears of it.
[▶ Broken: o1 is saved at t=2, and its event is never published](play:broken: dual write@t=2)

Swapping the order doesn't help. Publish first, then save: the broker has the event at t=2, the order service crashes at t=3 before saving, and billing charges $30 for an order that does not exist.
[▶ Broken: billing charges o1 at t=3, but the db never gets it](play:broken: publish first@t=2)

Either way, two systems that commit separately can end up disagreeing. Waiting longer or retrying faster doesn't change that.

## Building it up

**1. Make the event data in the same transaction.** Instead of publishing, the order service writes the order and an outbox row for its event to its own db, in one transaction. Either both commit or neither does, so a saved order always has its event written down. The client hears "placed" only after that commit.
[▶ The db commits o1 and its outbox row together at t=2](play:happy path@t=2)
This fixes the dual write: if the order service crashes now, the event is not lost. It is sitting in the outbox, marked unsent.

**2. A relay publishes unsent rows, again and again until the broker acks.** Every 5 ticks the relay reads the unsent rows and publishes each one. If the broker is down, the publish is simply lost, the row stays unsent, and the next poll tries again. Nobody has to remember anything in memory: the outbox is the to-do list, and it is on disk.
[▶ The broker is down: the relay's publish at t=8 is lost and o1 stays unsent](play:broker down@t=8)
[▶ The broker is back at t=20; the next poll publishes o1 and billing charges it at t=24](play:broker down@t=20)

**3. Mark the row sent only after the broker's ack.** The order of these two steps matters. If the row is marked sent first and the relay crashes before publishing, the outbox says "sent" for an event the broker never got, and nobody will ever retry it.
[▶ Broken: the db marks o1 sent as the relay reads it at t=6; the relay dies at t=7 and o1 is never published](play:broken: mark before publish@t=6)
Marking after the ack fixes that, but it has a price. If the relay crashes after publishing and before the ack reaches it, the row is still unsent, so after the restart the relay publishes it again. The broker now holds two copies of o1's event. This is why the outbox gives **at least once** delivery: not losing events means sometimes sending them twice.
[▶ The relay publishes o1 at t=7, crashes at t=8 and misses the ack, then publishes o1 again at t=19](play:relay crash@t=7)

**4. Make the consumer idempotent.** Billing keeps a list of the message ids it has processed. When an event arrives, billing checks the list. If the id is new, it charges the order and adds the id, both in one transaction in billing's own db. If the id is already there, it skips the charge and just acks, so the broker stops sending it.
Without that list, the second copy is charged too.
[▶ Broken: billing charges o1 a second time at t=21](play:broken: consumer without dedupe@t=21)
[▶ With the list, billing sees o1:placed again at t=21 and skips it](play:relay crash@t=21)

## Why it works now

- The order and its event commit in one transaction, so there is never a saved order without an event waiting to go out, and never an event for an order that wasn't saved.
- The relay keeps publishing a row until the broker acks it, so the event reaches the broker eventually, as long as the db survives and the broker comes back.
- Billing records each message id in the same transaction as the charge, so a duplicate can be noticed and skipped, even after billing restarts.
- The visualizer checks after every event that no order is charged twice and nothing is charged that was never saved. It holds through the relay's double publish [▶ see it hold](play:relay crash@t=21), and breaks the moment the consumer stops deduping [▶ see it break](play:broken: consumer without dedupe@t=21).

## What it costs

- **Delay.** The event goes out on the relay's next poll, not at once. Here the client hears "placed" at t=4, and billing only charges at t=9.
[▶ The poll at t=5 picks up o1](play:happy path@t=5)
- **An extra write per event**, and a relay polling the db, which adds load to it.
- **An outbox that grows.** Sent rows must be deleted or archived, or the table grows forever.
- **Duplicates are normal.** Every consumer has to dedupe, and its processed-id list grows too. In practice ids are kept for a limited time, which is only safe if duplicates can't arrive later than that.

## Staff notes

- **This is not two-phase commit.** Two-phase commit (lesson 024) makes the db and the broker commit together, but both must support it, and both can be left waiting if the node running the commit dies halfway. The outbox avoids needing that: one local transaction, then retries.
- **Change data capture** (CDC) means reading a database's own change log, the record of every committed write, instead of querying tables. A CDC tool can replace the polling relay: it sees each outbox insert as it commits. Debezium is a widely used open-source CDC tool, and it ships an outbox router for this pattern. It is faster than polling but is one more system to run.
- **"Exactly once" end to end** is really at-least-once delivery plus deduplication at the consumer. The processed-id record has to commit in the same transaction as the consumer's effect; if they are two writes, you are back to a dual write on the consumer's side.
- When the consumer's effect is outside its own db, such as a call to a payment provider, the dedupe list can't share a transaction with it. Pass the message id along as an **idempotency key** so the provider dedupes instead. Stripe's API, for example, accepts an `Idempotency-Key` header for this.
- **Ordering.** One relay publishing rows in order keeps events in order. With several relays, split the rows by a key such as the order id and give each relay its own share, so each order's events still go out in order.
- Kafka, a widely used broker, has an idempotent producer and transactions that stop duplicates inside Kafka, but they cannot include a write to your own database, which is exactly the gap the outbox fills.

## Check yourself

- **Q:** Why not just save the order and then publish the event, with a retry on the publish?
  A: The retry lives in the order service's memory. If the service crashes after the save and before the publish, the retry dies with it, and nothing on disk says an event is still owed. [▶ See it](play:broken: dual write@t=2)
- **Q:** The broker is down for a while. What happens to an order placed in that time?
  A: It is saved with its outbox row unsent. Each poll tries to publish and fails, and the row stays unsent until the broker is back, when the next poll publishes it. [▶ See it](play:broker down@t=20)
- **Q:** Why does the relay mark a row sent only after the broker acks, if that causes duplicates?
  A: The other order loses events: a crash between "mark sent" and "publish" leaves a row marked sent that the broker never got. A duplicate can be detected and skipped; a lost event can't be recovered. [▶ See it](play:broken: mark before publish@t=6)
- **Q:** The broker delivers o1's event twice. How does billing charge only once?
  A: Its processed-id list already has `o1:placed` from the first delivery, written in the same transaction as the first charge, so it skips the second and just acks. [▶ See it](play:relay crash@t=21)

## Deep dive

- Chris Richardson's microservices.io pattern pages "Transactional outbox" and "Idempotent consumer" describe both halves of this lesson.
- "Designing Data-Intensive Applications" (Martin Kleppmann) (1st edition) covers why distributed transactions are hard in chapter 9, change data capture in chapter 11, and end-to-end deduplication with operation identifiers in chapter 12.
- Debezium's documentation on its outbox event router shows the CDC version of the relay.
