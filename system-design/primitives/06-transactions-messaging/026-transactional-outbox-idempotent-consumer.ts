/**
 * 026. Transactional Outbox and Idempotent Consumer
 * Level: Staff
 * Group: Transactions & Messaging
 *
 * Problem: When an order is saved, other services (billing, email) must hear about it. The
 *   order lives in a database and the event travels through a message broker, and no single
 *   transaction covers both. Save then publish, and a crash in between loses the event.
 *   Publish then save, and a crash in between bills an order that was never saved.
 *
 * Approach: Outbox table, polling relay, idempotent consumer
 *   The order service writes the order and an outbox row describing the event in one local
 *   database transaction, so both exist or neither does. A relay polls the outbox, publishes
 *   each unsent row to the broker, and marks it sent only after the broker acknowledges it.
 *   A crash between publishing and marking makes the relay publish the row again, so the
 *   event arrives at least once. The consumer records each message id it has processed, in
 *   the same local transaction as its own change, and skips ids it has already seen.
 *
 * Cost: one extra row written per event; up to one poll interval of added delay; the consumer
 *   keeps one id per processed message.
 *
 * Pattern: reliable messaging
 * Key insight: Two systems cannot be made to commit together, but one database transaction
 *   can hold both the order and the event, as data. Everything after that is retrying until
 *   acknowledged, and retries create duplicates, so the consumer makes duplicates harmless.
 * Tradeoffs: Keeps state and events consistent without a distributed transaction (2PC, see
 *   024), at the price of at-least-once delivery, a poll interval of delay, and an outbox
 *   table that must be cleaned up. Polling is simple but adds database load; reading the
 *   database's own change log instead is faster but adds infrastructure.
 * Staff notes: Delete or archive sent rows, or the outbox grows forever. One relay publishing
 *   in row order keeps events in order; several relays need the rows partitioned by key.
 *   Change data capture (for example Debezium, which ships an outbox router) can replace the
 *   polling relay by reading the outbox inserts from the database log. "Exactly once" end to
 *   end is at-least-once delivery plus deduplication at the consumer, and the processed-id
 *   record must commit in the same transaction as the consumer's effect. Side effects outside
 *   the consumer's database, such as a call to a payment provider, need their own
 *   idempotency key.
 * Interview signals: "publish an event when an order is saved", "keep services in sync",
 *   "never lose a message", "exactly once", "no double charges", "event-driven
 *   microservices".
 * Real world: Debezium's outbox event router publishes outbox rows read from the database
 *   log. Kafka's idempotent producer and transactions avoid duplicates inside Kafka, but do
 *   not cover a write to another database, which is the gap the outbox fills. Stripe's API
 *   takes an Idempotency-Key header so a retried request does not charge twice.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type Fault, type NodeId, type SimResult } from "../../kernel/sim.ts";

const POLL_EVERY = 5;
const REDELIVER_AFTER = 6;
const DB = "db";
const BROKER = "broker";
const CONSUMER = "billing";

type OrderEvent = { id: string; orderId: string; amount: number };
type OutboxRow = OrderEvent & { sent: boolean };
type LogEntry = OrderEvent & { seq: number; acked: boolean; sentAt: number };

// @why The order service takes orders and runs the relay. It keeps nothing on disk itself: its database is a separate node.
export class OrderService extends SimNode {
  // @why Who asked for each order, so the reply can go out once the db has committed it.
  waiting: Record<string, NodeId> = {};

  state() {
    return { role: "order service + relay", summary: `relay polls every ${POLL_EVERY} ticks`, waiting: Object.keys(this.waiting) };
  }

  // @why The relay's poll timer. Without it, rows would sit in the outbox forever.
  onStart(ctx: Ctx) {
    if (ctx.now > 0) ctx.say("orders restarts with an empty memory. The relay starts polling again; anything still unsent is waiting in the outbox on disk");
    ctx.setTimer("Poll", POLL_EVERY);
  }

  onPlaceOrder(ctx: Ctx, body: { orderId: string; amount: number }, from: NodeId) {
    this.waiting[body.orderId] = from;
    // @why The event is plain data riding in the same insert as the order. Its id is what the consumer will dedupe on.
    const event: OrderEvent = { id: `${body.orderId}:placed`, orderId: body.orderId, amount: body.amount };
    ctx.say(`a customer places order ${body.orderId} ($${body.amount}). orders asks its db to save the order and a note "tell billing about ${body.orderId}" (an outbox row) in one transaction`);
    ctx.send(DB, "Insert", { orderId: body.orderId, amount: body.amount, event });
  }

  // @why The client hears "placed" only after the commit, and by then the event is already safe in the outbox.
  onInserted(ctx: Ctx, body: { orderId: string }) {
    const client = this.waiting[body.orderId];
    delete this.waiting[body.orderId];
    if (client) ctx.say(`the db has saved ${body.orderId}, so orders tells the customer "order placed". Billing hasn't heard yet; the outbox row will get it there`);
    if (client) ctx.send(client, "OrderPlaced", { orderId: body.orderId });
  }

  // @why Each poll asks for every unsent row, so a row whose publish failed is simply tried again next time.
  onPoll(ctx: Ctx) {
    ctx.say(`every ${POLL_EVERY} ticks the relay (a small loop inside orders) asks the db for outbox rows not yet sent`);
    ctx.send(DB, "ReadOutbox");
    ctx.setTimer("Poll", POLL_EVERY);
  }

  onOutboxRows(ctx: Ctx, body: { rows: OutboxRow[] }) {
    if (!body.rows.length) return ctx.say("the relay finds no unsent rows, so there is nothing to publish until the next poll");
    ctx.say(`the relay publishes ${body.rows.map((r) => r.id).join(", ")} to the broker. The row stays "unsent" until the broker confirms, so if this is lost it is simply tried again next poll`);
    // @why The row stays unsent for now. It is marked only when the broker confirms it has the event.
    for (const { sent: _sent, ...event } of body.rows) ctx.send(BROKER, "Publish", event);
  }

  // @why Marking after the ack means a crash can only cause a second publish, never a lost one.
  onPublishAck(ctx: Ctx, body: { id: string }) {
    ctx.say(`the broker confirms it has ${body.id}, so only now does the relay ask the db to mark its row sent`);
    ctx.send(DB, "MarkSent", { id: body.id });
  }
}

// @why The order service's own database. One handler call is one local transaction: all of it happens, or none.
export class OrderDb extends SimNode {
  // @why Both tables are on disk. The outbox surviving a crash is the whole point.
  static durable = ["orders", "outbox"];
  orders: Record<string, number> = {};
  // @why Events waiting to be published, in the order they were written.
  outbox: OutboxRow[] = [];

  state() {
    const ids = Object.keys(this.orders);
    const summary = `orders: ${ids.join(", ") || "none"} · outbox: ${this.outbox.map((r) => `${r.id.split(":")[0]} ${r.sent ? "sent" : "unsent"}`).join(", ") || "empty"}`;
    return { role: "database", summary, orders: { ...this.orders }, outbox: this.outbox.map((r) => `${r.id} ${r.sent ? "sent" : "unsent"}`) };
  }

  // @why The order and its event commit together. No crash can leave one without the other.
  onInsert(ctx: Ctx, body: { orderId: string; amount: number; event?: OrderEvent }, from: NodeId) {
    this.orders[body.orderId] = body.amount;
    if (body.event) this.outbox.push({ ...body.event, sent: false });
    ctx.say(
      body.event
        ? `good: the db commits order ${body.orderId} and outbox row ${body.event.id} together. A crash now can't keep one without the other`
        : `bad: the db commits order ${body.orderId}, but nothing on disk says it still needs publishing. Only orders' memory knows`,
    );
    ctx.send(from, "Inserted", { orderId: body.orderId });
  }

  onReadOutbox(ctx: Ctx, _body: unknown, from: NodeId) {
    const rows = this.outbox.filter((r) => !r.sent);
    ctx.say(rows.length ? `the db hands the relay ${rows.length} unsent row${rows.length > 1 ? "s" : ""}: ${rows.map((r) => r.id).join(", ")}. It stays unsent for now` : "the outbox has no unsent rows");
    ctx.send(from, "OutboxRows", { rows });
  }

  onMarkSent(ctx: Ctx, body: { id: string }) {
    const row = this.outbox.find((r) => r.id === body.id);
    if (row) row.sent = true;
    ctx.say(`good: the db marks ${body.id} sent. The relay will not publish it again`);
  }
}

// @why A message broker: it stores what it is given and keeps delivering it until the consumer confirms.
export class Broker extends SimNode {
  // @why On disk, so an event the broker acknowledged survives the broker restarting.
  static durable = ["log", "nextSeq"];
  log: LogEntry[] = [];
  nextSeq = 1;

  state() {
    const pending = this.log.filter((e) => !e.acked).length;
    const summary = `${this.log.length} stored · ${pending} unconfirmed`;
    return { role: "message broker", summary, log: this.log.map((e) => `#${e.seq} ${e.id} ${e.acked ? "consumed" : "pending"}`) };
  }

  // @why After a restart, anything still unconfirmed needs its redelivery timer again.
  onStart(ctx: Ctx) {
    if (ctx.now > 0) ctx.say("the broker is back up and accepting events again");
    if (this.log.some((e) => !e.acked)) ctx.setTimer("Redeliver", REDELIVER_AFTER);
  }

  onPublish(ctx: Ctx, event: OrderEvent, from: NodeId) {
    // @why The broker does not check for repeats: a second publish of the same event becomes a second entry.
    const entry: LogEntry = { ...event, seq: this.nextSeq++, acked: false, sentAt: ctx.now };
    this.log.push(entry);
    ctx.say(
      `the broker stores ${event.id} as message #${entry.seq}${entry.seq > 1 && this.log.some((e) => e.id === event.id && e.seq !== entry.seq) ? " (a second copy: the broker doesn't check for repeats)" : ""}, delivers it to billing, and confirms back to ${from}`,
    );
    ctx.send(CONSUMER, "Deliver", { seq: entry.seq, id: entry.id, orderId: entry.orderId, amount: entry.amount });
    // @why The ack is the relay's only proof that the event is safe here.
    ctx.send(from, "PublishAck", { id: event.id });
    // @why If billing never confirms, this timer sends the event again.
    ctx.setTimer("Redeliver", REDELIVER_AFTER);
  }

  // @why A delivery or its confirmation can be lost, so anything unconfirmed for a while is sent again: at least once.
  onRedeliver(ctx: Ctx) {
    if (!this.log.some((e) => !e.acked)) ctx.say("the broker checks for messages billing never confirmed: there are none, so nothing is resent");
    for (const e of this.log) {
      if (e.acked || ctx.now - e.sentAt < REDELIVER_AFTER) continue;
      e.sentAt = ctx.now;
      ctx.say(`billing never confirmed #${e.seq}, so the broker delivers it again: "at least once" means repeats are possible`);
      ctx.send(CONSUMER, "Deliver", { seq: e.seq, id: e.id, orderId: e.orderId, amount: e.amount });
    }
    if (this.log.some((e) => !e.acked)) ctx.setTimer("Redeliver", REDELIVER_AFTER);
  }

  onConsumed(ctx: Ctx, body: { seq: number }) {
    const e = this.log.find((x) => x.seq === body.seq);
    if (e) e.acked = true;
    ctx.say(`billing confirms message #${body.seq}, so the broker stops trying to deliver it`);
  }
}

// @why The consumer: billing charges each order once.
export class Billing extends SimNode {
  // @why The charges and the processed ids are on disk together, so a restart cannot forget which events were applied.
  static durable = ["processed", "charged", "skipped"];
  // @why Ids of every event already applied. This is what makes a repeat delivery harmless.
  processed: string[] = [];
  // @why Billing's own ledger: one entry per charged order.
  charged: string[] = [];
  skipped = 0;

  state() {
    const summary = `charged: ${this.charged.join(", ") || "nobody"}${this.skipped ? ` · skipped ${this.skipped} repeat` : ""}`;
    return { role: "consumer", summary, processed: [...this.processed], charged: [...this.charged], skipped: this.skipped };
  }

  onDeliver(ctx: Ctx, body: { seq: number } & OrderEvent, from: NodeId) {
    if (this.processed.includes(body.id)) {
      this.skipped++;
      ctx.say(`good: billing has already processed ${body.id} (it is in its processed list), so it skips message #${body.seq}: the customer is charged only once`);
    } else {
      // @why The charge and the record of its id commit in one local transaction, so neither can happen without the other.
      this.charged.push(body.orderId);
      this.processed.push(body.id);
      ctx.say(`billing charges ${body.orderId} $${body.amount} and, in the same transaction, writes ${body.id} into its processed list`);
    }
    // @why Confirm either way. A skipped duplicate still needs confirming, or the broker would keep redelivering it.
    ctx.send(from, "Consumed", { seq: body.seq });
  }
}

// @why The guarantee, checked after every event: no order is charged twice, and nothing is charged that was never saved.
export function billedOncePerSavedOrder(nodes: Record<NodeId, SimNode>): string | null {
  const db = Object.values(nodes).find((n) => n instanceof OrderDb) as OrderDb | undefined;
  const billing = Object.values(nodes).find((n) => n instanceof Billing) as Billing | undefined;
  if (!db || !billing) return null;
  const seen = new Set<string>();
  for (const orderId of billing.charged) {
    if (seen.has(orderId)) return `billing charged ${orderId} twice`;
    seen.add(orderId);
    if (!(orderId in db.orders)) return `billing charged ${orderId}, but the db has no order ${orderId}`;
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: no outbox. Saves the order, then publishes as a second step.
class DualWriteService extends OrderService {
  amounts: Record<string, number> = {};
  // No relay: nothing is ever written down that still needs publishing.
  onStart(ctx: Ctx) {
    if (ctx.now > 0)
      ctx.say("bad: orders restarts. o1 is saved in the db, but the plan to publish it was only in memory, so it is gone. Billing never hears of o1: the shop ships an order nobody is ever charged for");
  }
  onPlaceOrder(ctx: Ctx, body: { orderId: string; amount: number }, from: NodeId) {
    this.waiting[body.orderId] = from;
    this.amounts[body.orderId] = body.amount;
    ctx.say(`orders saves ${body.orderId} first, and plans to publish it once the db says it is saved. That plan lives only in memory`);
    ctx.send(DB, "Insert", { orderId: body.orderId, amount: body.amount });
  }
  onInserted(ctx: Ctx, body: { orderId: string }) {
    ctx.say(`${body.orderId} is saved; now orders publishes it`);
    ctx.send(BROKER, "Publish", { id: `${body.orderId}:placed`, orderId: body.orderId, amount: this.amounts[body.orderId] });
    super.onInserted(ctx, body);
  }
}

// Broken on purpose: no outbox. Publishes the event first, then saves the order.
class PublishFirstService extends OrderService {
  amounts: Record<string, number> = {};
  onStart(_ctx: Ctx) {}
  onPlaceOrder(ctx: Ctx, body: { orderId: string; amount: number }, from: NodeId) {
    this.waiting[body.orderId] = from;
    this.amounts[body.orderId] = body.amount;
    ctx.say(`orders publishes ${body.orderId} to the broker first, and plans to save it only once the broker has it`);
    ctx.send(BROKER, "Publish", { id: `${body.orderId}:placed`, orderId: body.orderId, amount: body.amount });
  }
  onPublishAck(ctx: Ctx, body: { id: string }) {
    const orderId = body.id.split(":")[0];
    ctx.say(`broker has ${body.id}; now orders saves ${orderId}`);
    ctx.send(DB, "Insert", { orderId, amount: this.amounts[orderId] });
  }
}

// Broken on purpose: marks rows sent as soon as the relay reads them, before they are published.
class MarkOnRead extends OrderDb {
  onReadOutbox(ctx: Ctx, _body: unknown, from: NodeId) {
    const rows = this.outbox.filter((r) => !r.sent);
    for (const r of rows) r.sent = true;
    if (rows.length) ctx.say(`bad: the db hands ${rows.map((r) => r.id).join(", ")} to the relay and marks it sent right away, before the broker has it`);
    else if (this.outbox.length) ctx.say(`bad: the relay finds nothing to publish, because the outbox says ${this.outbox.map((r) => r.id).join(", ")} was sent. It never reached the broker: billing will never charge o1, and nothing will ever retry it`);
    ctx.send(from, "OutboxRows", { rows });
  }
}

// Broken on purpose: applies every delivery, with no record of what it has already processed.
class NoDedupeBilling extends Billing {
  onDeliver(ctx: Ctx, body: { seq: number } & OrderEvent, from: NodeId) {
    const again = this.charged.includes(body.orderId);
    this.charged.push(body.orderId);
    ctx.say(
      again
        ? `bad: ${body.id} arrives a second time, and billing charges the card again because it keeps no list of what it processed. The customer pays $${body.amount * 2} for one $${body.amount} order`
        : `billing charges ${body.orderId} $${body.amount}, but keeps no record of which events it has processed`,
    );
    ctx.send(from, "Consumed", { seq: body.seq });
  }
}

type Parts = { orders?: () => OrderService; db?: () => OrderDb; billing?: () => Billing };
const shop = (parts: Parts = {}) => ({
  orders: parts.orders ?? (() => new OrderService()),
  db: parts.db ?? (() => new OrderDb()),
  broker: () => new Broker(),
  billing: parts.billing ?? (() => new Billing()),
});
const placeOrder: ClientOp = { at: 1, to: "orders", type: "PlaceOrder", body: { orderId: "o1", amount: 30 } };
const run = (parts: Parts, faults: Fault[] = [], until = 40) =>
  simulate({ nodes: shop(parts), seed: 1, until, latency: [1, 1], clients: [placeOrder], faults, invariant: billedOncePerSavedOrder });
const db = (r: SimResult) => r.nodes.db as OrderDb;
const broker = (r: SimResult) => r.nodes.broker as Broker;
const billing = (r: SimResult) => r.nodes.billing as Billing;
const violated = (r: SimResult, prefix: string) => r.run.steps.some((s) => s.violation?.startsWith(prefix));
// The relay sends o1 to the broker at t=7; the order service is down from t=8 to t=12, so the broker's ack is lost.
const relayCrash: Fault[] = [
  { at: 8, kind: "crash", node: "orders" },
  { at: 12, kind: "recover", node: "orders" },
];

test("happy path: the order is saved and the event reaches the consumer once", () => {
  const r = run({});
  assert.equal(r.run.error, undefined);
  assert.deepEqual(db(r).orders, { o1: 30 });
  assert.deepEqual(db(r).outbox.map((row) => row.sent), [true]);
  assert.deepEqual(billing(r).charged, ["o1"]);
  assert.ok(r.inbox.some((m) => m.type === "OrderPlaced"));
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("relay crash: published but not marked, so it is sent twice, and the consumer applies it once", () => {
  const r = run({}, relayCrash);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(broker(r).log.map((e) => e.id), ["o1:placed", "o1:placed"]);
  assert.deepEqual(billing(r).charged, ["o1"]);
  assert.equal(billing(r).skipped, 1);
  assert.deepEqual(db(r).outbox.map((row) => row.sent), [true]);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("broker down: the event waits in the outbox and goes out when the broker is back", () => {
  const r = run({}, [
    { at: 2, kind: "crash", node: "broker" },
    { at: 20, kind: "recover", node: "broker" },
  ]);
  assert.equal(r.run.error, undefined);
  assert.ok(r.run.steps.some((s) => s.kind === "drop" && s.msg?.type === "Publish" && s.dropReason === "crashed"));
  const during = r.run.steps.filter((s) => s.t > 2 && s.t < 20);
  assert.ok(during.every((s) => (s.nodes.db.state.outbox as string[])[0] === "o1:placed unsent"));
  assert.ok(during.every((s) => (s.nodes.billing.state.charged as string[]).length === 0));
  assert.deepEqual(billing(r).charged, ["o1"]);
  assert.deepEqual(db(r).outbox.map((row) => row.sent), [true]);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("broken: dual write — save then publish, and a crash in between loses the event", () => {
  // The db commits o1 at t=2. The order service dies at t=3, just as the db's reply arrives,
  // so the publish that was its next step never happens, and nothing remembers it should.
  const r = run({ orders: () => new DualWriteService() }, [
    { at: 3, kind: "crash", node: "orders" },
    { at: 6, kind: "recover", node: "orders" },
  ]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(db(r).orders, { o1: 30 });
  assert.equal(broker(r).log.length, 0);
  assert.deepEqual(billing(r).charged, []);
});

test("broken: publish first — publish then save, and a crash in between bills an order that does not exist", () => {
  const r = run({ orders: () => new PublishFirstService() }, [{ at: 3, kind: "crash", node: "orders" }]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(db(r).orders, {});
  assert.deepEqual(billing(r).charged, ["o1"]);
  assert.ok(violated(r, "billing charged o1, but the db has no order"));
});

test("broken: mark before publish — the row is marked sent when read, and a relay crash loses the event", () => {
  // The db hands o1's row to the relay at t=6 and marks it sent then. The relay dies at t=7,
  // as the rows arrive, so o1 is never published, and the outbox says it was.
  const r = run({ db: () => new MarkOnRead() }, [
    { at: 7, kind: "crash", node: "orders" },
    { at: 9, kind: "recover", node: "orders" },
  ]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(db(r).orders, { o1: 30 });
  assert.deepEqual(db(r).outbox.map((row) => row.sent), [true]);
  assert.equal(broker(r).log.length, 0);
  assert.deepEqual(billing(r).charged, []);
});

test("broken: consumer without dedupe — the duplicate is applied twice", () => {
  const r = run({ billing: () => new NoDedupeBilling() }, relayCrash);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(billing(r).charged, ["o1", "o1"]);
  assert.ok(violated(r, "billing charged o1 twice"));
});
