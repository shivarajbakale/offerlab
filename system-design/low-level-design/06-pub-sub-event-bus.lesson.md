# Pub-sub event bus

## What it is

- **What it is:** An in-process message board: code publishes a message to a named topic such as order.placed, and every handler subscribed to that topic is called with it, while the publisher never knows who is listening.
- **The problem it solves:** A plain loop over the handler list breaks as soon as handlers misbehave: one that throws stops the rest and fails the publisher, one that unsubscribes during the loop makes another handler silently miss the message, and one that publishes from inside its handler delivers events out of order. A try/catch per handler, a copy of the list per dispatch and an optional queue fix each.
- **Reach for it when:** Several parts of one program react to the same event and should not know about each other, or an interview asks for the observer pattern, an event bus, or what happens when a listener throws or removes itself.
- **Not the right tool when:** The publisher needs an answer back: that is a plain function call or a request and reply. Messages must cross processes or survive a crash: use a broker, as in [async events between services](#/sd-microservices/06-async-events-between-services) and [Kafka partitions](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups).
- **Where you'll meet it:** The browser's EventTarget and Node's EventEmitter are this design and differ in documented ways: the browser skips a listener removed during dispatch and calls the next listener after one throws, while Node still calls a listener removed mid-emit and lets a throw escape emit(). Interviews ask for it as "design an event bus".

## Words we'll use

- **Topic** — a name for a kind of event, such as `order.placed`. Publishers and subscribers agree on topic names, not on each other.
- **Publish** — announce that something happened: "an order was placed, here is its id". The result is a **message**: a topic, some data, and a sequence number (`#1`, `#2`) saying which came first.
- **Subscribe** — ask to be told about a topic. The code that gets called is a **handler**; a handler plus its topic is a **subscription**. **Unsubscribe** removes one.
- **Dispatch** — the loop that calls every handler subscribed to a message's topic.
- **Synchronous delivery** — publish calls every handler before it returns, on the publisher's own call stack.
- **Queued delivery** — publish only adds the message to a **queue** (first in, first out) and returns. A separate step, **drain**, takes messages off the queue one at a time and dispatches each.
- **Isolation** — one handler's failure cannot affect the other handlers or the publisher.
- **Snapshot** — a copy of the subscriber list taken when dispatch starts, so changes to the real list during the loop cannot shift what the loop is walking.

## The world we're in

- One program, one thread. Checkout, billing, email, analytics and the rest live in it and talk through the bus, so checkout's code never names billing or email.
- Handlers are written by other teams. Any of them may throw, may unsubscribe (itself or someone else) while it runs, or may publish a new message from inside its handler.
- A handler that throws here stands in for a real failure: the mail server is down, a bug, a bad input.
- Nothing here crosses a network. The bus is a map and a loop; the questions it raises come back at every scale.

## The goal

Every live subscriber of a topic gets every message on it, exactly once, and in the order messages were published where that can be kept. A handler that throws costs nobody else the message and does not fail the publisher. A handler that unsubscribes during dispatch does not make anyone else miss the message, and a subscription that has been removed is not called again.

## The naive attempt

"Keep a list per topic and call each handler in a loop."

```
for (const sub of list) sub.handler(msg)
```

Checkout places order A-1. Billing runs and charges the customer. Then the email handler throws because the mail server is down.
[▶ Broken: email throws, with no try/catch around it](play:broken: no isolation@at=unguarded-call#2)
The throw ends the loop, so analytics never hears about the order. And the error keeps going, out of publish and into checkout, which tells the customer checkout failed for an order that was placed and paid for.
[▶ Broken: checkout reports a failure for a placed order](play:broken: no isolation@at=publisher-sees-error#1)

A second version walks the list by index, `for (let i = 0; i < list.length; i++)`, and a one-shot "first order coupon" handler unsubscribes itself when it runs. Removing it from index 0 moves billing down to index 0, and the loop goes on to index 1, which is now email.
[▶ Broken: the loop's next index is email; billing was stepped over](play:broken: live list@at=live-index#2)
Billing never sees the order. Nothing threw, and no error is logged anywhere.

## Building it up

**1. A map from topic to subscriptions.** `subscribe` adds to the topic's list and returns a function that unsubscribes. Publish looks up the topic and calls only those handlers: billing and email get `order.placed`, the welcome handler gets only `user.signup`.
[▶ Billing gets order #1](play:sync: every subscriber@at=call#1)

**2. One try/catch per handler.** Each call is wrapped on its own. When email throws, the bus records the failure and moves on to the next handler.
[▶ Email throws; the bus records it](play:isolation@at=isolate#1)
[▶ Analytics still gets the message](play:isolation@at=call#3)
Checkout's publish returns normally and the customer is told the order was placed. Where the failures go is a choice: a log, an error counter, a retry, or a dead-letter list kept for a person to look at. What matters is that they stop at the handler.

**3. Walk a snapshot, not the live list.** Dispatch copies the list before the loop.
[▶ The copy is taken first](play:unsubscribe during dispatch@at=snapshot#1)
The coupon handler unsubscribes itself, which removes it from the real list.
[▶ The coupon handler removes itself](play:unsubscribe during dispatch@at=inactive#1)
The loop walks the copy, whose positions did not move, so billing is called next. On order #2 the coupon handler is gone and only billing runs.
[▶ Billing still gets order #1](play:unsubscribe during dispatch@at=call#2)

**4. Removed means removed.** The copy has a cost: it still holds subscriptions removed during the loop. So unsubscribe marks the subscription inactive before removing it, and dispatch skips inactive ones. Here a cleanup handler unsubscribes the audit handler, which comes after it in the same dispatch.
[▶ Cleanup unsubscribes audit](play:removed means removed@at=inactive#1)
[▶ Audit is in the copy, but inactive: skipped](play:removed means removed@at=skip-removed#2)
This matches the browser's rule for event listeners: one removed during dispatch is not called. Node's EventEmitter makes the other choice and still calls it for the emit in progress. Either is defensible; pick one and write it down.

**5. Synchronous delivery reorders events.** The inventory handler publishes `stock.low` from inside its `order.placed` handler. In sync mode that nested publish runs a whole dispatch before the outer loop gets to audit.
[▶ Audit gets stock.low while order.placed is still being delivered](play:sync: a handler that publishes@at=call#2)
[▶ Only then does audit get order.placed](play:sync: a handler that publishes@at=call#3)
Audit hears about the low stock before the order that caused it. Any subscriber that keeps state from a stream of events (a running total, a status) can go wrong when effects arrive before causes.

**6. Queued delivery keeps publish order.** In queued mode publish only appends to the queue and returns, so checkout does not wait for any handler.
[▶ Publish only enqueues](play:queued@at=enqueue#1)
Drain takes one message and delivers it to every subscriber before taking the next. The nested `stock.low` is appended behind `order.placed`, and audit sees them in the order they were published.
[▶ stock.low joins the back of the queue](play:queued@at=enqueue#2)
[▶ Audit gets order.placed first](play:queued@at=call#2)
[▶ Then the next message: stock.low](play:queued@at=next-message#2)

## Why it works now

- Each handler call has its own try/catch, so a throw ends that call and nothing else. Without it, one throw stopped analytics and failed checkout:
  [▶ See it break](play:broken: no isolation@at=publisher-sees-error#1)
- Dispatch walks a copy, so removing a subscription during the loop cannot shift the positions of the ones still to be called. Walking the live list stepped over billing:
  [▶ See it break](play:broken: live list@at=live-index#2)
- Unsubscribe marks before it removes, and dispatch checks the mark, so the copy never calls a removed subscription.
- Queued mode delivers one message completely before starting the next, so every subscriber sees messages in publish order, even ones published by handlers.

## What it costs

- **A copy per publish.** O(subscribers of the topic) memory and time on every publish. Fine for tens of handlers. When subscribe is rare and publish is common, keep the list copy-on-write instead: subscribe and unsubscribe build a new array, and dispatch uses whatever array was current when it started, with no copy.
- **Swallowed errors.** Isolation hides failures unless something reads them. The failures list must feed a log, a metric or an alert, or a broken handler fails silently forever.
- **Queued mode loses the publisher's answer.** Publish returns before any handler runs, so the publisher cannot know if billing worked. If it must know, that is a request and its reply, not an event.
- **Queued mode is still one thread.** Drain runs handlers one after another; a slow handler delays every message behind it. Running handlers on separate workers removes that wait but also removes the ordering guarantee, unless each topic (or each key, such as an order id) has its own worker.
- **Nothing survives a crash.** The queue is in memory. A process that dies with messages in it loses them; durable delivery needs a broker that writes them down.

## Staff notes

- **The design in one breath.** `EventBus` with `subscribe(topic, handler) -> unsubscribe`, `publish(topic, data)`, a `Map<topic, Subscription[]>`, a delivery mode, and a failure sink. Subscriptions carry an id and an active flag. Interviewers like a returned unsubscribe function better than `unsubscribe(handler)`: the same function subscribed twice is then two subscriptions, and removing one cannot remove the other.
- **Extensibility.** Wildcard topics (`order.*`) change the lookup, not the dispatch. Priorities change the list order. Filters are a predicate per subscription. Middleware (logging, timing) wraps the handler call in one place: the line with the try/catch.
- **Concurrency.** With threads, two publishes can dispatch at once and subscribe can race with dispatch. A lock around the map plus copy-on-write lists gives each dispatch a stable snapshot without holding the lock while handlers run. Never hold a lock while calling a handler: with a non-reentrant lock a handler that publishes deadlocks itself, with any lock a handler that waits on another thread can deadlock, and a slow handler stalls every publisher.
- **Re-entrancy.** Sync mode lets a handler publish, which recurses. Two handlers that publish to each other's topics recurse until the stack overflows. Queued mode turns that into an endless queue instead, so cap drain or detect the loop.
- **Testing.** The bus has no clock and no I/O, so tests publish and assert on a delivery log. Test the four hostile handlers by name: one that throws, one that unsubscribes itself, one that unsubscribes another, one that publishes.
- **At scale** the same questions come back with a broker (Kafka, a cloud queue or topic): a failing consumer becomes a retry and a dead-letter queue, ordering is kept only per partition or per key, and delivery is usually at least once, so handlers must be idempotent.

## Check yourself

- **Q:** The email handler throws. Without a try/catch per handler, who else is hurt?
  A: Every handler after it misses the message (analytics), and the error escapes into the publisher, so checkout reports a failure for an order already placed and charged. [▶ Show it](play:broken: no isolation@at=publisher-sees-error#1)
- **Q:** A handler unsubscribes itself, and the bus walks the live list by index. Who misses the message?
  A: The next subscriber. Removing the entry moves everyone after it down one place, and the loop's next index skips over the one that moved into the gap. [▶ Show it](play:broken: live list@at=live-index#2)
- **Q:** Dispatch walks a copy. Cleanup unsubscribes audit, which comes later in the same copy. Is audit called?
  A: No. Unsubscribe marked it inactive, and dispatch skips inactive subscriptions, so removed means removed even inside a copy. [▶ Show it](play:removed means removed@at=skip-removed#2)
- **Q:** Inventory publishes `stock.low` from its `order.placed` handler. In sync mode, which does audit see first?
  A: `stock.low`. The nested publish runs a full dispatch before the outer loop reaches audit. Queued mode puts it behind `order.placed`. [▶ Show it](play:sync: a handler that publishes@at=call#2)
