/**
 * 06. Pub-Sub Event Bus
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design an in-process event bus. Code publishes a message to a named topic
 *   ("order.placed"); every handler subscribed to that topic gets it, and the publisher does not
 *   know who they are. Handlers can subscribe and unsubscribe at any time, even from inside a
 *   handler. One broken handler must not stop the others from getting the message, or break
 *   the code that published it.
 *
 * Approach: Topic map, snapshot dispatch, one try/catch per handler, optional queue
 *   Keep a map from topic to its list of subscriptions. To deliver, copy the list first and walk
 *   the copy, so a handler that unsubscribes (itself or another) cannot shift the list under
 *   the loop; skip any subscription marked inactive since the copy was made. Call each handler
 *   inside its own try/catch and record a failure instead of letting it escape. In queued mode,
 *   publish only appends to a FIFO queue and a separate drain() delivers, one message to every
 *   subscriber before the next message starts.
 *
 * Cost: publish is O(subscribers of the topic) for the copy and the calls; subscribe is O(1);
 *   unsubscribe is O(subscribers of the topic) to find it in the list.
 *
 * Pattern: observer / publish-subscribe, fault isolation, snapshot iteration
 * Key insight: Every handler is someone else's code. Treat each call as something that can
 *   throw, unsubscribe, or publish again, and make sure none of those can change who else gets
 *   the message or the order they see messages in.
 * Tradeoffs: Synchronous delivery is simple and the publisher knows every handler has run when
 *   publish returns, but the publisher waits for every handler, and a handler that publishes
 *   makes later subscribers see the second message before the first. Queued delivery keeps
 *   publish order for everyone and returns at once, but handlers run later and a failure can
 *   no longer be reported to the publisher.
 * Staff notes: Interviewers probe what happens when a handler throws, unsubscribes during
 *   dispatch, publishes during dispatch, or is slow. Concurrency: with threads, guard the topic
 *   map (copy-on-write lists make the snapshot free). Testing: the bus is pure, so tests call
 *   publish and check a delivery log. Across processes this becomes a broker (Kafka, SNS, a
 *   queue), and the same questions come back as retries, ordering and dead-letter queues.
 * Interview signals: "design an event bus", "observer pattern", "pub/sub", "what if a listener
 *   throws", "remove a listener inside its own callback", "events in order".
 * Real world: The browser's EventTarget copies the listener list when an event is dispatched,
 *   does not call a listener added during dispatch, and does not call one removed during
 *   dispatch before its turn. Node's EventEmitter also copies the list, but a listener removed
 *   during an emit is still called by that emit. A listener that throws: the browser reports
 *   the error and calls the next listener; Node's emit() throws it to the emitter's caller, and
 *   the listeners after it are not called.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Message = { seq: number; topic: string; data: string };
export type Handler = (msg: Message) => void;
export type Subscription = { id: number; topic: string; name: string; handler: Handler; active: boolean };
export type Mode = "sync" | "queued";

export class EventBus {
  // @why Subscriptions by topic, in the order they subscribed. A publisher names a topic, never a subscriber.
  subs = new Map<string, Subscription[]>();
  mode: Mode;
  // @why Queued mode only: messages published but not delivered yet, oldest first.
  queue: Message[] = [];
  // @why What happened, in order: "billing <- order.placed #1". Tests and the picture read it.
  log: string[] = [];
  // @why Handlers that threw: recorded here instead of escaping into the publisher.
  failures: string[] = [];
  nextId = 1;
  nextSeq = 1;

  constructor(mode: Mode = "sync") {
    this.mode = mode;
  }

  /** Returns the function that unsubscribes. */
  subscribe(topic: string, name: string, handler: Handler): () => void {
    const sub = { id: this.nextId++, topic, name, handler, active: true };
    if (!this.subs.has(topic)) this.subs.set(topic, []);
    this.subs.get(topic)!.push(sub);
    return () => this.unsubscribe(sub.id, topic);
  }

  unsubscribe(id: number, topic: string) {
    const list = this.subs.get(topic) ?? [];
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return;
    // @why Marked first: a dispatch already walking its copy of the list will see this and skip it.
    list[i].active = false; // @mark inactive
    list.splice(i, 1);
  }

  publish(topic: string, data: string): number {
    const msg = { seq: this.nextSeq++, topic, data };
    if (this.mode === "queued") {
      // @why Queued: only enqueue. The publisher returns at once; drain() delivers later, in publish order.
      this.queue.push(msg); // @mark enqueue
      return msg.seq;
    }
    this.dispatch(msg);
    return msg.seq;
  }

  /** Queued mode: deliver everything waiting, including messages handlers publish meanwhile. */
  drain() {
    while (this.queue.length > 0) {
      // @why One message reaches every subscriber before the next one starts.
      const msg = this.queue.shift()!; // @mark next-message
      this.dispatch(msg);
    }
  }

  dispatch(msg: Message) {
    // @why A copy: handlers may subscribe or unsubscribe while we loop, and must not shift the list we are walking.
    const list = [...(this.subs.get(msg.topic) ?? [])]; // @mark snapshot
    for (const sub of list) {
      // @why Unsubscribed since the copy was made, by itself or another handler: removed means not called again.
      if (!sub.active) continue; // @mark skip-removed
      try {
        sub.handler(msg); // @mark call
        this.log.push(`${sub.name} <- ${msg.topic} #${msg.seq}`);
      } catch (err) {
        // @why Isolate: record it and go on to the next handler. One bad handler cannot cost the others the message.
        this.failures.push(`${sub.name} failed on #${msg.seq}: ${(err as Error).message}`); // @mark isolate
      }
    }
  }
}

/** A publisher: checkout places an order and announces it. It should not care who listens. */
export class Checkout {
  bus: EventBus;
  // @why What checkout tells the customer.
  results: string[] = [];

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  placeOrder(orderId: string) {
    try {
      this.bus.publish("order.placed", orderId);
      this.results.push(`${orderId}: placed`);
    } catch (err) {
      // @why Only a bus that lets handler errors escape can get here: the order was placed, yet checkout reports a failure.
      this.results.push(`${orderId}: checkout failed (${(err as Error).message})`); // @mark publisher-sees-error
    }
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: calls handlers with no try/catch. The first one that throws ends the loop,
// and its error escapes into the publisher.
export class NoIsolationBus extends EventBus {
  dispatch(msg: Message) {
    const list = [...(this.subs.get(msg.topic) ?? [])];
    for (const sub of list) {
      if (!sub.active) continue;
      sub.handler(msg); // @mark unguarded-call
      this.log.push(`${sub.name} <- ${msg.topic} #${msg.seq}`);
    }
  }
}

// Broken on purpose: walks the live list by index. A handler that unsubscribes itself removes
// its own entry, every later entry moves down one place, and the loop steps over the next one.
export class LiveListBus extends EventBus {
  dispatch(msg: Message) {
    const list = this.subs.get(msg.topic) ?? [];
    for (let i = 0; i < list.length; i++) {
      const sub = list[i]; // @mark live-index
      sub.handler(msg);
      this.log.push(`${sub.name} <- ${msg.topic} #${msg.seq}`);
    }
  }
}

const noop: Handler = () => {};

test("sync: every subscriber of the topic gets the message, and only them", () => {
  const bus = new EventBus();
  bus.subscribe("order.placed", "billing", noop);
  bus.subscribe("order.placed", "email", noop);
  bus.subscribe("user.signup", "welcome", noop);
  bus.publish("order.placed", "A-1");
  bus.publish("user.signup", "u-7");
  assert.deepEqual(bus.log, ["billing <- order.placed #1", "email <- order.placed #1", "welcome <- user.signup #2"]);
});

test("isolation: a handler that throws is recorded, and the rest still get the message", () => {
  const bus = new EventBus();
  const checkout = new Checkout(bus);
  bus.subscribe("order.placed", "billing", noop);
  bus.subscribe("order.placed", "email", () => {
    throw new Error("mail server down");
  });
  bus.subscribe("order.placed", "analytics", noop);
  checkout.placeOrder("A-1");
  assert.deepEqual(bus.log, ["billing <- order.placed #1", "analytics <- order.placed #1"]);
  assert.deepEqual(bus.failures, ["email failed on #1: mail server down"]);
  assert.deepEqual(checkout.results, ["A-1: placed"]);
});

test("unsubscribe during dispatch: a one-shot handler removes itself, and the next one still gets the message", () => {
  const bus = new EventBus();
  let off = () => {};
  off = bus.subscribe("order.placed", "first-order-coupon", () => off());
  bus.subscribe("order.placed", "billing", noop);
  bus.publish("order.placed", "A-1");
  bus.publish("order.placed", "A-2");
  assert.deepEqual(bus.log, ["first-order-coupon <- order.placed #1", "billing <- order.placed #1", "billing <- order.placed #2"]);
});

test("removed means removed: a handler unsubscribed earlier in the same dispatch is not called", () => {
  const bus = new EventBus();
  let offAudit = () => {};
  bus.subscribe("account.closed", "cleanup", () => offAudit());
  offAudit = bus.subscribe("account.closed", "audit", noop);
  bus.publish("account.closed", "u-7");
  assert.deepEqual(bus.log, ["cleanup <- account.closed #1"]);
  assert.equal(bus.subs.get("account.closed")!.length, 1);
});

test("sync: a handler that publishes makes later subscribers see the second message first", () => {
  const bus = new EventBus("sync");
  const seen: string[] = [];
  bus.subscribe("order.placed", "inventory", () => {
    bus.publish("stock.low", "sku-9");
  });
  bus.subscribe("order.placed", "audit", (m) => {
    seen.push(m.topic);
  });
  bus.subscribe("stock.low", "audit", (m) => {
    seen.push(m.topic);
  });
  bus.publish("order.placed", "A-1");
  // Audit hears about the low stock before the order that caused it.
  assert.deepEqual(seen, ["stock.low", "order.placed"]);
});

test("queued: publish returns at once, and drain delivers every message in publish order", () => {
  const bus = new EventBus("queued");
  const seen: string[] = [];
  bus.subscribe("order.placed", "inventory", () => {
    bus.publish("stock.low", "sku-9");
  });
  bus.subscribe("order.placed", "audit", (m) => {
    seen.push(m.topic);
  });
  bus.subscribe("stock.low", "audit", (m) => {
    seen.push(m.topic);
  });
  bus.publish("order.placed", "A-1");
  assert.deepEqual(bus.log, [], "nothing delivered yet: the publisher did not wait for any handler");
  bus.drain();
  assert.deepEqual(seen, ["order.placed", "stock.low"]);
  assert.equal(bus.queue.length, 0);
});

test("broken: no isolation — one throwing handler stops delivery to the rest and fails checkout", () => {
  const bus = new NoIsolationBus();
  const checkout = new Checkout(bus);
  bus.subscribe("order.placed", "billing", noop);
  bus.subscribe("order.placed", "email", () => {
    throw new Error("mail server down");
  });
  bus.subscribe("order.placed", "analytics", noop);
  checkout.placeOrder("A-1");
  // Billing ran, so the customer was charged; analytics never heard; checkout says it failed.
  assert.deepEqual(bus.log, ["billing <- order.placed #1"]);
  assert.deepEqual(checkout.results, ["A-1: checkout failed (mail server down)"]);
});

test("broken: live list — a handler that unsubscribes itself makes the next one miss the message", () => {
  const bus = new LiveListBus();
  let off = () => {};
  off = bus.subscribe("order.placed", "first-order-coupon", () => off());
  bus.subscribe("order.placed", "billing", noop);
  bus.subscribe("order.placed", "email", noop);
  bus.publish("order.placed", "A-1");
  // Removing index 0 moved billing to index 0; the loop went on to index 1, which is email.
  assert.deepEqual(bus.log, ["first-order-coupon <- order.placed #1", "email <- order.placed #1"]);
});
