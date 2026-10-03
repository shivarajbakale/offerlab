/**
 * 05. Webhook Delivery
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: Your API must tell a customer's server when something happens ("order o-1 was
 *   paid") by POSTing to a URL they gave you. Their server is sometimes down. Answers get
 *   lost. Anyone on the internet can POST to that URL too, and an attacker who captures one
 *   real request can send it again. The receiver must ship each paid order exactly once, and
 *   only for orders that really were paid.
 *
 * Approach: Signed, retried, at-least-once delivery, with receivers that verify and dedup
 *   1. The sender signs each request: an HMAC, keyed with a secret shared with that customer,
 *      over the event id, a timestamp and the body.
 *   2. The receiver recomputes the HMAC and rejects any request whose signature is wrong, or
 *      whose timestamp is outside a short window (a replay).
 *   3. Any answer other than 2xx, or no answer, is retried with exponential backoff, a fresh
 *      timestamp and signature each time, up to a limit; then the event is parked in a
 *      dead-letter list for a person or a replay tool.
 *   4. So an event can arrive more than once, and in any order. The receiver remembers the
 *      event ids it has processed and acknowledges a repeat without acting on it, and keeps
 *      the newest version of each object instead of whatever arrived last.
 *
 * Cost: one HMAC per attempt on each side; the receiver stores processed event ids for longer
 *   than the sender retries; the sender stores every undelivered event.
 *
 * Pattern: webhooks, HMAC request signing, at-least-once delivery, idempotent consumer
 * Key insight: The sender cannot know whether a request whose answer was lost was processed,
 *   so it must resend, so delivery is at-least-once. Exactly-once effect is the receiver's job:
 *   dedup by event id. And since the URL is public, the signature, not the source address, is
 *   what proves a request came from the sender.
 * Tradeoffs: A short replay window rejects more replays but also honest requests delayed in
 *   transit or from servers with skewed clocks. Long retry schedules deliver through long
 *   outages but deliver late. Ordering is not guaranteed; a sender that tried to guarantee it
 *   would have to stop all later events behind one failing event.
 * Staff notes: Receivers should verify, record the event, answer 2xx quickly, and do the work
 *   from their own queue, or a slow handler times out and causes redeliveries. Compare
 *   signatures in constant time. Support two secrets at once so a secret can be rotated.
 *   Receivers should treat the payload as a hint and, for anything important, fetch the
 *   current state from the API. Senders should offer a replay tool and per-endpoint logs.
 * Interview signals: "notify the customer's system", "callback URL", "webhook", "verify the
 *   sender", "events delivered twice", "out of order", "receiver is down".
 * Real world: Stripe signs `timestamp.payload` with HMAC-SHA256 in a Stripe-Signature header,
 *   and its libraries reject timestamps older than 5 minutes by default. GitHub signs the body
 *   with HMAC-SHA256 in X-Hub-Signature-256. The Standard Webhooks spec signs
 *   `id.timestamp.body` and sends webhook-id, webhook-timestamp and webhook-signature
 *   headers, the layout used here. Stripe, for one, documents that an event can be delivered
 *   more than once and that delivery order is not guaranteed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Headers = Record<string, string>;
export type Event = { id: string; orderId: string; status: "paid" | "cancelled"; version: number };
export type WebhookRequest = { headers: Headers; body: string };
type Delivery = { event: Event; attempt: number; dueAt: number; state: "pending" | "delivered" | "dead" };

// @why Attempts before giving up, and the first retry delay in seconds: then 2, 4, 8, 16 seconds apart.
const MAX_ATTEMPTS = 5;
const BASE_DELAY_S = 2;
// @why How far a request's timestamp may be from the receiver's clock, in seconds. 5 minutes is a common default.
const TOLERANCE_S = 300;

/** The customer's server, at the URL they registered. */
export class Receiver {
  secret: string;
  // @why Event ids already handled. A redelivery of one of these gets 200 and does nothing.
  processed = new Set<string>();
  // @why The newest version applied for each order, so an older event that arrives late cannot roll it back.
  orders = new Map<string, { status: string; version: number }>();
  // @why The side effect that must happen once per paid order.
  shipments: string[] = [];
  // @why The receiver answers 503 until this time: down for a deploy, say.
  downUntil = -1;

  constructor(secret: string) {
    this.secret = secret;
  }

  receive(req: WebhookRequest, now: number): number {
    if (now < this.downUntil) return 503; // @mark down
    const id = req.headers["webhook-id"];
    const ts = req.headers["webhook-timestamp"];
    const sig = req.headers["webhook-signature"];
    // @why The URL is public. Without a signature there is no way to know who sent this.
    if (id === undefined || ts === undefined || sig === undefined) return 400; // @mark unsigned
    // @why Too old or too far ahead: a captured request being replayed later. Reject it, whatever its signature.
    if (Math.abs(now - Number(ts)) > TOLERANCE_S) return 400; // @mark stale
    // @why Only someone with the secret can produce this value, and it covers the id, the timestamp and every byte of the body.
    const expected = `v1,${hmac(this.secret, `${id}.${ts}.${req.body}`)}`;
    if (!sameInConstantTime(sig, expected)) return 400; // @mark badSignature
    // @why Delivery is at-least-once, so this may be a repeat. Answer 200 so the sender stops, and do nothing else.
    if (this.processed.has(id)) return 200; // @mark duplicate
    this.apply(JSON.parse(req.body));
    // @why A real receiver records the id and the effect in one transaction, so a crash cannot keep one without the other.
    this.processed.add(id); // @mark processed
    return 200;
  }

  apply(event: Event) {
    const current = this.orders.get(event.orderId);
    // @why Order is not guaranteed. If a newer version is already applied, this one is old news.
    if (current !== undefined && current.version >= event.version) return; // @mark olderEvent
    this.orders.set(event.orderId, { status: event.status, version: event.version }); // @mark applied
    if (event.status === "paid") this.shipments.push(event.orderId); // @mark ship
  }
}

/** The API provider's webhook dispatcher for one customer endpoint. */
export class Sender {
  secret: string;
  receiver: Receiver;
  // @why Every event until the receiver answers 2xx, or until it runs out of attempts.
  queue: Delivery[] = [];
  // @why Faults to play: attempts ("evt_1#1") whose answer is lost on the way back, after the receiver acted.
  lostAnswers: string[] = [];
  log: string[] = [];

  constructor(secret: string, receiver: Receiver) {
    this.secret = secret;
    this.receiver = receiver;
  }

  publish(event: Event, now: number) {
    this.queue.push({ event, attempt: 0, dueAt: now, state: "pending" });
  }

  /** Attempt every delivery that is due, in time order, until `end`. */
  runUntil(end: number) {
    let t = nextDue(this.queue);
    while (t !== null && t <= end) {
      for (const d of this.queue) if (d.state === "pending" && d.dueAt === t) this.attempt(d, t);
      t = nextDue(this.queue);
    }
  }

  attempt(d: Delivery, now: number) {
    d.attempt++;
    const body = JSON.stringify(d.event);
    // @why Each attempt is signed afresh with the current time, so a retry hours later is still inside the window.
    const ts = String(now);
    const sig = hmac(this.secret, `${d.event.id}.${ts}.${body}`); // @mark sign
    const headers = { "webhook-id": d.event.id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` };
    const answer = this.receiver.receive({ headers, body }, now); // @mark post
    // @why A lost answer is a timeout: the sender cannot tell it from a request that never arrived.
    const status = this.lostAnswers.includes(`${d.event.id}#${d.attempt}`) ? 0 : answer;
    this.log.push(`t=${now} ${d.event.id} #${d.attempt}: ${status === 0 ? "timeout" : status}`); // @mark outcome
    if (status >= 200 && status < 300) {
      d.state = "delivered"; // @mark acked
      return;
    }
    if (d.attempt >= MAX_ATTEMPTS) {
      // @why Stop retrying and keep the event for a person or a replay tool. Never drop it silently.
      d.state = "dead"; // @mark deadLetter
      return;
    }
    // @why Exponential backoff: wait twice as long after each failure, so a struggling receiver gets room.
    d.dueAt = now + BASE_DELAY_S * 2 ** (d.attempt - 1); // @mark backoff
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: acts on any request that arrives at its URL. No signature, no timestamp check.
export class TrustingReceiver extends Receiver {
  receive(req: WebhookRequest, _now: number): number {
    // @why Anyone who knows (or guesses) the URL can send this body.
    this.apply(JSON.parse(req.body)); // @mark trusted
    return 200;
  }
}

// Broken on purpose: verifies the signature but treats every delivery as new.
export class NoDedupReceiver extends Receiver {
  receive(req: WebhookRequest, now: number): number {
    const expected = `v1,${hmac(this.secret, `${req.headers["webhook-id"]}.${req.headers["webhook-timestamp"]}.${req.body}`)}`;
    if (now < this.downUntil || req.headers["webhook-signature"] !== expected) return 503;
    const event: Event = JSON.parse(req.body);
    // @why A redelivery of an event it already handled is handled again.
    this.shipments.push(event.orderId); // @mark shipAgain
    return 200;
  }
}

// Quiet: a TOY keyed hash standing in for HMAC-SHA256 (two rounds of 32-bit FNV-1a). Not secure; real code uses a crypto library.
function hmac(secret: string, message: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${secret}|${message}|${secret}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Quiet: compares every character whatever it finds, so the time taken does not reveal how much matched.
function sameInConstantTime(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function nextDue(queue: Delivery[]): number | null {
  const due = queue.filter((d) => d.state === "pending").map((d) => d.dueAt);
  return due.length ? Math.min(...due) : null;
}

const SECRET = "whsec_shared";
const paid = (id: string, orderId: string, version = 1): Event => ({ id, orderId, status: "paid", version });

function setup(receiver = new Receiver(SECRET)): { sender: Sender; receiver: Receiver } {
  return { sender: new Sender(SECRET, receiver), receiver };
}

// Quiet: what an attacker captured from the wire: the exact request the sender made for an event at time `at`.
function captured(event: Event, at: number): WebhookRequest {
  const body = JSON.stringify(event);
  const sig = hmac(SECRET, `${event.id}.${at}.${body}`);
  return { headers: { "webhook-id": event.id, "webhook-timestamp": String(at), "webhook-signature": `v1,${sig}` }, body };
}

test("signed delivery: the receiver checks the signature, ships the order, answers 200", () => {
  const { sender, receiver } = setup();
  sender.publish(paid("evt_1", "o-1"), 0);
  sender.runUntil(0);
  assert.deepEqual(sender.log, ["t=0 evt_1 #1: 200"]);
  assert.deepEqual(receiver.shipments, ["o-1"]);
});

test("retries: the receiver is down until t=10; attempts at 0, 2, 6 get 503, the one at 14 lands", () => {
  const { sender, receiver } = setup();
  receiver.downUntil = 10;
  sender.publish(paid("evt_1", "o-1"), 0);
  sender.runUntil(100);
  assert.deepEqual(sender.log, ["t=0 evt_1 #1: 503", "t=2 evt_1 #2: 503", "t=6 evt_1 #3: 503", "t=14 evt_1 #4: 200"]);
  assert.deepEqual(receiver.shipments, ["o-1"]);
});

test("dead letter: after 5 failed attempts the event is parked, not dropped", () => {
  const { sender } = setup();
  sender.receiver.downUntil = 1000;
  sender.publish(paid("evt_1", "o-1"), 0);
  sender.runUntil(1000);
  assert.equal(sender.log.length, 5);
  assert.equal(sender.log[4], "t=30 evt_1 #5: 503");
  assert.equal(sender.queue[0].state, "dead");
});

test("lost answer: the receiver processed it, the sender resends, the receiver dedups by id", () => {
  const { sender, receiver } = setup();
  sender.lostAnswers = ["evt_1#1"];
  sender.publish(paid("evt_1", "o-1"), 0);
  sender.runUntil(100);
  assert.deepEqual(sender.log, ["t=0 evt_1 #1: timeout", "t=2 evt_1 #2: 200"]);
  assert.deepEqual(receiver.shipments, ["o-1"], "shipped once");
});

test("out of order: the cancel (v2) lands before the retried payment (v1), and the order stays cancelled", () => {
  const { sender, receiver } = setup();
  // A blip at t=0 fails the first event's first attempt only.
  receiver.downUntil = 1;
  sender.publish(paid("evt_1", "o-1", 1), 0);
  sender.publish({ id: "evt_2", orderId: "o-1", status: "cancelled", version: 2 }, 1);
  sender.runUntil(100);
  assert.deepEqual(sender.log, ["t=0 evt_1 #1: 503", "t=1 evt_2 #1: 200", "t=2 evt_1 #2: 200"]);
  assert.deepEqual(receiver.orders.get("o-1"), { status: "cancelled", version: 2 });
  assert.deepEqual(receiver.shipments, [], "a cancelled order is not shipped");
});

test("forged and tampered: no signature, or a changed body, gets 400 and does nothing", () => {
  const receiver = new Receiver(SECRET);
  const forged = { headers: {}, body: JSON.stringify(paid("evt_9", "o-9")) };
  assert.equal(receiver.receive(forged, 0), 400);
  const real = captured(paid("evt_1", "o-1"), 0);
  const tampered = { headers: real.headers, body: real.body.replace("o-1", "o-9") };
  assert.equal(receiver.receive(tampered, 0), 400);
  assert.deepEqual(receiver.shipments, []);
});

test("replay: a captured request resent within the window is a duplicate; resent later it is too old", () => {
  const { sender, receiver } = setup();
  sender.publish(paid("evt_1", "o-1"), 0);
  sender.runUntil(0);
  const copy = captured(paid("evt_1", "o-1"), 0);
  assert.equal(receiver.receive(copy, 60), 200, "within 5 minutes: already processed, nothing happens");
  assert.equal(receiver.receive(copy, 400), 400, "after 5 minutes: rejected on its timestamp");
  assert.deepEqual(receiver.shipments, ["o-1"]);
});

test("broken: a receiver that trusts unsigned requests ships an order nobody paid for", () => {
  const receiver = new TrustingReceiver(SECRET);
  const forged = { headers: {}, body: JSON.stringify(paid("evt_9", "o-9")) };
  assert.equal(receiver.receive(forged, 0), 200);
  assert.deepEqual(receiver.shipments, ["o-9"]);
});

test("broken: a receiver without dedup ships the order twice when an answer is lost", () => {
  const { sender, receiver } = setup(new NoDedupReceiver(SECRET));
  sender.lostAnswers = ["evt_1#1"];
  sender.publish(paid("evt_1", "o-1"), 0);
  sender.runUntil(100);
  assert.deepEqual(sender.log, ["t=0 evt_1 #1: timeout", "t=2 evt_1 #2: 200"]);
  assert.deepEqual(receiver.shipments, ["o-1", "o-1"]);
});
