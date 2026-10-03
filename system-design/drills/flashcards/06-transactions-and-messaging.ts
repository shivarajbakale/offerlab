/**
 * 06. Transactions and Messaging
 * Level: Staff
 * Group: Flashcards
 *
 * Keeping several services or stores consistent without one shared transaction: two-phase
 * commit, sagas, the transactional outbox with idempotent consumers, and Kafka's partitions and
 * consumer groups.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const P = "sd-06-transactions-messaging";
const TWO_PC = `${P}/024-two-phase-commit`;
const SAGA = `${P}/025-saga-with-compensation`;
const OUTBOX = `${P}/026-transactional-outbox-idempotent-consumer`;
const KAFKA = `${P}/027-kafka-partitions-consumer-groups`;

export const deck = flashcards("Transactions and messaging", [
  {
    front: "What are the two phases of two-phase commit?",
    back: "**Prepare**: the coordinator asks every participant to vote; a yes is backed by locks and written to disk. **Commit or abort**: if every vote was yes the coordinator decides commit, otherwise abort, and tells everyone.",
    link: TWO_PC,
  },
  {
    front: "At what exact moment does a two-phase commit transaction commit?",
    back: "When the coordinator **writes its decision to disk**. Every later message, resend and restart repeats that answer.",
    link: TWO_PC,
  },
  {
    front: "Why is two-phase commit called a blocking protocol?",
    back: "If the coordinator dies after the participants voted yes, they can neither commit nor abort, so they **hold their locks** until it comes back, blocking other work on those rows.",
    link: TWO_PC,
  },
  {
    front: "A prepared participant has waited a long time for the coordinator. Why must it not abort on its own?",
    back: "The coordinator may already have decided **commit** and told others. Deciding alone can commit at one participant and abort at another. XA calls such forced outcomes heuristic decisions, and a \"heuristic mixed\" outcome needs manual cleanup.",
    link: TWO_PC,
  },
  {
    front: "How do systems such as Spanner keep two-phase commit from blocking on one coordinator?",
    back: "They **replicate the coordinator's log with consensus**: each participant is a Paxos group, one group acts as coordinator, so losing one machine does not lose the decision.",
    link: TWO_PC,
  },
  {
    front: "Why do microservice designs usually avoid two-phase commit?",
    back: "It makes every service **hold locks for a coordinator it doesn't own**, so one slow coordinator stalls them all, and not every datastore or broker supports XA. The usual alternative is a saga.",
    link: TWO_PC,
  },
  {
    front: "What is a saga?",
    back: "A sequence of **local transactions**, one per service. If a later step fails, earlier steps are undone by **compensating** steps (release the stock, refund the card). Nobody holds a lock while waiting for anyone else.",
    link: SAGA,
  },
  {
    front: "What does a saga give up compared with one ACID transaction?",
    back: "**Isolation.** Each step commits at once, so other requests see halfway states: an order holding the last unit while its payment is being declined turns away another buyer.",
    link: SAGA,
  },
  {
    front: "Some halfway states of a saga must not be acted on. What do you do?",
    back: "Mark them **pending** and make other requests respect the marker (a semantic lock), or re-check before the final step.",
    link: SAGA,
  },
  {
    front: "A saga sends an email and hands a parcel to a courier. Where do those steps go?",
    back: "**Last**, after every step likely to fail. They can't be undone, only followed up (\"sorry, ignore that\").",
    link: SAGA,
  },
  {
    front: "Orchestration or choreography for a saga?",
    back: "**Orchestration**: one orchestrator keeps a durable log and tells each service what to do, so the whole flow is in one place to read and monitor. **Choreography**: each service reacts to the previous service's event; no central component, but the flow is spread across services and harder to follow and change.",
    link: SAGA,
  },
  {
    front: "What must be true of saga steps and compensations for retries to be safe?",
    back: "They must be **idempotent**. Requests and compensations are retried until answered, so a repeated one must not take or give back twice.",
    link: SAGA,
  },
  {
    front: "A saga step timed out and the orchestrator compensates it. What can go wrong?",
    back: "The original request may still be in flight, so the **compensation can arrive first** and the late request then applies. The service must remember \"this order was cancelled\" and refuse the late request.",
    link: SAGA,
  },
  {
    front: "A service saves an order, then publishes an \"order placed\" event. What can go wrong?",
    back: "The **dual write** problem: a crash between the two leaves a saved order with no event, or (publishing first) an event for an order that was never saved.",
    link: OUTBOX,
  },
  {
    front: "How does the transactional outbox fix the dual write?",
    back: "Write the order and an **outbox row** with the event in the **same local transaction**. A relay publishes outbox rows until the broker acknowledges them. The price is a delay until the relay's next poll, and an outbox table to clean up.",
    link: OUTBOX,
  },
  {
    front: "The outbox relay can publish the same event twice. How does the consumer stay correct?",
    back: "It records each **message id in the same transaction** as its effect and skips ids it has seen. If the id and the effect are separate writes, the dual write is back, on the consumer's side.",
    link: OUTBOX,
  },
  {
    front: "Someone promises \"exactly-once delivery\". What is it really?",
    back: "**At-least-once delivery plus deduplication** at the consumer. The network can always lose an acknowledgement, so something must be safe to receive twice.",
    link: OUTBOX,
  },
  {
    front: "The consumer's effect is a call to an outside payment provider. How do you dedupe?",
    back: "The dedupe record cannot share a transaction with someone else's system, so pass the message id as an **idempotency key**, if the provider accepts one (Stripe's API takes an `Idempotency-Key` header). Otherwise you need your own record of what was sent and a way to ask the provider.",
    link: OUTBOX,
  },
  {
    front: "What can replace the outbox's polling relay?",
    back: "**Change data capture**: reading the database's own change log and publishing each outbox insert as it commits (Debezium has an outbox router for this). Faster than polling, but one more system to run.",
    link: OUTBOX,
  },
  {
    front: "What ordering does Kafka guarantee?",
    back: "Order **within a partition** only. Messages with the same key go to the same partition, so choose the key for the order you need (per account, per order) and no finer.",
    link: KAFKA,
  },
  {
    front: "A topic has 6 partitions. You run 10 consumers in one classic consumer group. How many do work?",
    back: "**Six.** In a classic consumer group a partition has one owner at a time (Kafka 4's share groups relax this, giving up order), so the partition count caps a group's parallelism; the other four sit idle.",
    link: KAFKA,
  },
  {
    front: "Why plan a Kafka topic's partition count up front?",
    back: "Adding partitions later changes **which partition a key hashes to**, so for a while a key's old and new messages are in different partitions and their order is not guaranteed.",
    link: KAFKA,
  },
  {
    front: "Commit the consumer offset before or after processing?",
    back: "**After.** A crash then repeats messages (at-least-once) but never skips one. Committing first means a crash mid-processing **loses** messages. Auto-commit is only at-least-once if processing finishes before the next poll.",
    link: KAFKA,
  },
  {
    front: "One customer sends most of the messages and their partition lags. Will adding consumers help?",
    back: "No. One key is always one partition, with one owner in a classic consumer group. A **hot key** needs a finer key (if its order allows) or faster processing; more consumers only help other partitions.",
    link: KAFKA,
  },
  {
    front: "What does a consumer group rebalance cost, and what reduces it?",
    back: "In Kafka's original (eager) protocol **every consumer stops** until the new assignment. Cooperative (incremental) rebalancing pauses only partitions that move. A crashed consumer's partitions also go unread until its session times out.",
    link: KAFKA,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
  assert.deepEqual([...new Set(deck.cards.map((c) => c.link))].sort(), [TWO_PC, SAGA, OUTBOX, KAFKA].sort());
});

test("the arithmetic on the cards", () => {
  const working = (partitions: number, consumers: number) => Math.min(partitions, consumers);
  assert.equal(working(6, 10), 6);
});
