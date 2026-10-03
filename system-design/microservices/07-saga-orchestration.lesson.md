# Saga orchestration

## What it is

- **What it is:** A saga runs one business transaction that spans several services as a series of steps, each committed in its own service's database, and pairs each step with an undo. In orchestration, one service directs the steps and records how far it got.
- **The problem it solves:** When an order touches several services with separate databases, a failure halfway leaves the earlier steps done: a customer charged for an order that failed, or stock locked forever. A saga undoes the earlier steps, or retries the later ones, until the whole order is consistent.
- **Reach for it when:** One operation changes data owned by several services or an outside provider such as a payment company, no single database transaction can cover them all, and each step can be undone or retried.
- **Not the right tool when:** All the data lives in one database: use a plain transaction. If every part must commit together and every participant supports it, [two-phase commit](#/sd-06-transactions-messaging/024-two-phase-commit) gives that at the cost of locks. For two or three steps, services reacting to each other's [events](#/sd-microservices/06-async-events-between-services) can be enough.
- **Where you'll meet it:** Garcia-Molina and Salem's 1987 paper "Sagas"; workflow engines such as Temporal, AWS Step Functions and Camunda; card payments split into authorize and capture; "Design a travel booking system" and "Design checkout" interviews.

## Words we'll use

- **Transaction** — a group of changes that happen all together or not at all. Inside one database this is easy: `BEGIN`, the changes, `COMMIT`; a crash before the commit undoes everything.
- **Local transaction** — a transaction inside one service's own database. It cannot include another service's data.
- **Two-phase commit (2PC)** — a protocol that makes several databases commit together: a coordinator asks each one to prepare (lock the rows and promise to commit), then tells all of them to commit. Lesson 024 walks through it.
- **Saga** — a business transaction done as a sequence of local transactions, one per service. If a later step fails, the saga runs **compensating transactions**: new steps that undo the earlier ones in business terms (release the stock, refund the charge).
- **Orchestration** — one service (the **orchestrator**) tells each participant what to do next and records how far the saga got. The other style, **choreography**, has each service react to the previous one's events with no central coordinator.
- **Compensable step** — a step with a cheap, reliable undo. Reserving stock is one: release it.
- **Pivot step** — the step after which the saga can no longer turn back cheaply. Here, charging the card.
- **Retriable step** — a step after the pivot that must eventually succeed, so it is retried until it does, never undone. Booking the courier is one.
- **Idempotency key** — a unique id sent with a request so that sending it twice has the effect of sending it once. Many payment APIs accept one.
- **Timeout** — the caller stops waiting. It does not mean the other side stopped working: the outcome is unknown.

## The world we're in

- A shop takes 1,000 orders a second. We time requests from our own edge, 1 ms from the user.
- Four parts change data for each order: **Orders** records it in its database, **Inventory** reserves the items, an outside **payment provider** charges the card (~40 ms, 10 ms away), and **Shipping** books a courier.
- Each service owns its own database. Nothing wraps all four in one transaction.
- Parts fail: Shipping goes down for 3 s, the payment provider goes down for 3 s, the payment provider gets 10 times slower for 3 s.

## The goal

When any step fails, never leave the customer charged without an order, or stock locked forever, and keep taking orders when a step that can wait is down.

## The naive attempt

"Orders records the order, charges the card, reserves the stock and books shipping, in that order. If a step fails, return an error."

On a good day each order takes about 75 ms, most of it the payment provider.
[▶ About 75 ms per order](play:no undo: about@t=2)

At 3 s Shipping goes down. Every order now fails at the last step. But the steps before it already committed in their own databases: the card was charged and the stock reserved. About 1,000 customers a second are charged for an order they were told failed, and nothing in the system will ever give the money back. Three seconds of outage, 3,000 wrong charges.
[▶ Broken: charged for orders that failed](play:broken: no undo@t=5)

Two things are wrong: there is no undo, and the step that is hardest to undo (taking money) happens early, so every later failure lands on it.

## Building it up

**1. Why not a distributed transaction?** Two-phase commit could make all four commit together. It has two costs here. Every participant holds its locks from when it does its writes until the commit, so each order's rows stay locked across several network round trips, including the 40 ms payment. And if the coordinator dies between the phases, the participants wait, still locked, until it comes back. And outside payment providers generally do not offer 2PC to their callers at all. Lesson 024 shows the blocking case.

**2. Give each step an undo.** A saga accepts that the steps commit one by one, and pairs each step with a compensation: "reserve stock" with "release stock", "charge" with "refund". The orchestrator, Orders, records the saga's state in its database after each step, so if it crashes it can resume, or compensate, from where it was. Lesson 025 traces this logic step by step.

**3. Put the steps in the right order.** Compensable steps first (record the order as pending, reserve stock), the pivot as late as possible (charge the card), and after the pivot only steps that can be retried until they succeed (book shipping). Then a failure before the pivot is undone cheaply, and a failure after it is just a delay, as long as the later step can eventually succeed. One that never can (an invalid address) needs a person, or a forward recovery such as a refund and an apology. Orders hands "book shipping" to a queue, so Shipping does not need to be up when the order is placed. On a good day this still takes about 75 ms.
[▶ The saga: about 75 ms per order](play:saga: about@t=2)

**4. Shipping down.** No order fails. The booking steps wait in the queue; deliveries to Shipping keep failing, and each is hidden for 1 s and retried. The 40 consumers retry each step the moment it is visible again, so almost nothing is visible at any one time, but the queue holds every step since 3 s: about 2,000 by 5 s. When Shipping returns at 6 s, each held step comes back as its last timeout runs out. The oldest waiting step is then about 3 s old (counted from when it was first queued; retries do not reset the age), and the queue is empty just after 7 s. Nobody was charged for an order that did not happen: every charged order will ship, a little late.
[▶ Shipping down: no failed orders](play:saga: Shipping down@t=5)
[▶ Drained about a second after recovery](play:saga: Shipping down@t=7.2)

**5. The payment provider down.** Now the pivot fails, so the order fails, and that is correct: no money was taken (every charge failed) and nothing reached Shipping. But every one of those orders reserved stock first. That is about 1,000 compensations a second: "release the stock for order N". This is the compensation work a saga creates, and it lands on Inventory at exactly the moment something else is broken.
[▶ Payments down: ~1,000 reservations a second to release](play:saga: payment provider down@t=5)

**6. The payment provider slow.** At 3 s charges start taking about 400 ms. Orders gives up after 250 ms and fails the order. About 83% of orders now fail. But the provider has not given up: most of those charges then succeed, about 800 a second, after Orders has stopped listening. If Orders treats the timeout as "payment failed" and releases the stock, those customers have paid for nothing.
[▶ Broken: timeouts, then charges that went through anyway](play:broken: saga with a slow@t=5)

The fix is in the orchestrator's logic, not its shape. A timeout means "unknown". Before compensating, Orders must find out what happened: ask the provider for the payment's status, or, with a provider that supports idempotency keys, retry the charge with the same key, so the provider returns the first attempt's result instead of charging again (read its rules: some reject a retry while the first attempt is still running). Only a known "declined" is safe to undo.

## Why it works now

Without one transaction, a failure in the middle leaves earlier steps committed. The naive order put the charge early and had no undo, so every later failure became a wrong charge.
[▶ Broken: Shipping down, customers charged](play:broken: no undo@t=4)
The saga ordered the steps so that failures before the pivot have cheap undos, and steps after it only need patience. The remaining danger is not knowing whether the pivot happened, which is why a timeout must be resolved, never guessed.
[▶ The same Shipping outage, no failed orders](play:saga: Shipping down@t=4)

## What it costs

- **No isolation.** Between steps, others can see the half-done state: stock reserved for an order that will be cancelled, which another customer could not buy.
- **Compensations are code.** Each one is business logic that must be written, tested, and itself retried until it succeeds. Some undos are not perfect: a refund is not the same as never charging (the customer sees both on their statement).
- **The orchestrator's state.** Orders must durably record each step and resume after a crash. Workflow engines (Temporal, AWS Step Functions, Camunda) exist mostly to do this part.
- **What this simulator shows, and what it does not.** It shows failure rates, which steps were reached (calls per service), how many sagas stopped part way (the compensation work), backlogs, and work finished after the caller gave up. It does not run the compensations, does not model business failures such as a declined card or an item out of stock, and does not track each order's state. Lesson 025 does those, one order at a time.

## Staff notes

- Order a saga's steps on purpose: compensable, then the pivot, then retriable. Ask "what is the hardest step to undo?" and move it as late as you can.
- Card payments are often split into an authorization (a hold on the money, which can be voided) and a capture (the actual charge) later, which makes the payment cheaper to undo until it ships.
- Every participant must be idempotent: sagas retry steps and compensations, and queues deliver at least once.
- Monitor sagas that are stuck: started but neither completed nor compensated after some time. That count is your inconsistency.
- Choreography (each service reacting to events) has no central coordinator, which suits two or three steps. With more, the flow is spread over many services and hard to follow; an orchestrator keeps the flow in one place.

## Check yourself

- **Q:** In the naive chain, Shipping was down. Why were customers charged for orders that failed?
  A: The charge committed in an earlier step, in its own system, and nothing undid it when the last step failed. [▶ Show it](play:broken: no undo@t=5)
- **Q:** Why does the saga take no failed orders while Shipping is down?
  A: Booking shipping comes after the pivot and is retried from a queue until it succeeds, so it only delays. [▶ Show it](play:saga: Shipping down@t=5)
- **Q:** The payment provider is down. What compensation work does the saga create?
  A: Every failed order had reserved stock, so about 1,000 releases a second; no refunds, since no charge succeeded. [▶ Show it](play:saga: payment provider down@t=5)
- **Q:** Orders timed out on 83% of charges. Why is "release the stock and tell the user it failed" wrong?
  A: Most of those charges succeeded after Orders gave up. A timeout is unknown; check the status or retry with the same idempotency key first. [▶ Show it](play:broken: saga with a slow@t=5)
