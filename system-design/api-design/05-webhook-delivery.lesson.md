# Webhook delivery

## What it is

- **What it is:** A webhook is an HTTP request your service sends to a URL a customer registered, to tell their server that something happened, such as "order paid". Delivering them well means signing them, retrying them, and letting receivers ignore repeats.
- **The problem it solves:** A webhook URL is public and networks lose answers, so a naive receiver can be fooled by forged requests, miss events while it is down, or act twice on a retried one. Signatures, timestamps, retries with backoff, and checks on event ids and versions guard against each.
- **Reach for it when:** Your platform must tell customers' systems about changes as they happen (payments, orders, code pushes), or you are building the receiving end of someone else's webhooks.
- **Not the right tool when:** The client cannot expose a public URL, or needs a complete history: let it read a list of events with a [cursor](#/sd-api-design/01-cursor-pagination) instead. Between your own services, a message broker carrying [async events](#/sd-microservices/06-async-events-between-services) is the usual tool.
- **Where you'll meet it:** Stripe webhooks, signed with HMAC-SHA256 in a `Stripe-Signature` header; GitHub webhooks, signed in `X-Hub-Signature-256`; the Standard Webhooks spec; "Design a webhook delivery system" interviews.

## Words we'll use

- **Webhook** — an HTTP POST that your API sends to a URL a customer registered, to tell their server that something happened, such as "order o-1 was paid". You are the **sender**; their server is the **receiver**.
- **Event** — one thing that happened, with a unique **event id** (`evt_1`). Here it also carries the order it is about and that order's **version**, which goes up with every change to the order.
- **Acknowledge** (ack) — the receiver answers 2xx: "got it, stop sending". Any other status, or no answer at all, means "try again".
- **At-least-once delivery** — every event is delivered one or more times; a repeat is possible, a loss is not.
- **Backoff** — waiting between retries. **Exponential** backoff doubles the wait each time: here 2, 4, 8, 16 seconds.
- **Dead letter** — an event the sender stopped retrying, kept aside for a person or a replay tool instead of being dropped.
- **HMAC** — a keyed hash: `HMAC(secret, message)` gives a short value that only someone who knows the secret can compute, and that changes completely if one byte of the message changes. Here it is the **signature**.
- **Replay** — an attacker who captured one real request sends it again later. The **replay window** (tolerance) is how old a request's signed timestamp may be before the receiver rejects it.
- **Dedup** — deduplicate: recognise a delivery the receiver has already processed, and not act on it again.

## The world we're in

- A shop platform sends a customer's server an event whenever one of their orders changes. On "paid", the customer's server ships the order.
- The customer's server goes down for deploys. Networks lose answers: the receiver can act on a request and the sender never hear back.
- The URL is on the public internet. Anyone who finds it can POST to it, and an attacker may capture a real request and resend it.
- Sender and receiver share a secret, given to the customer when they registered the URL.
- Time is a number of seconds passed to each call, so the runs are repeatable. The signature here is a toy keyed hash standing in for HMAC-SHA256.

## The goal

Every paid order is shipped exactly once, and only orders that the platform really reported as paid, through outages, lost answers, events arriving out of order, and attackers.

## The naive attempt

"POST the event once. The receiver reads the body and does what it says."

An attacker POSTs `{"orderId": "o-9", "status": "paid"}` to the URL. The receiver cannot tell who sent it, so it ships o-9, which nobody paid for.
[▶ Broken: the receiver acts on a forged request](play:broken: a receiver that trusts@at=trusted#1)
[▶ Broken: and ships o-9](play:broken: a receiver that trusts@at=ship#1)
And "send once" fails the moment the receiver is down: the event is simply lost. Retrying fixes that but creates the next problem. Here the receiver ships o-1, the answer is lost, and the sender, seeing a timeout, sends it again.
[▶ Broken: the first delivery ships o-1, and its answer is lost](play:broken: a receiver without dedup@at=outcome#1)
A receiver that treats every delivery as new ships o-1 a second time.
[▶ Broken: the redelivery ships it again](play:broken: a receiver without dedup@at=shipAgain#2)

## Building it up

**1. Sign every request.** The sender computes `HMAC(secret, "evt_1.0.{body}")` over the event id, the timestamp and the body, and sends it in a `webhook-signature` header with `webhook-id` and `webhook-timestamp`.
[▶ The sender signs id, timestamp and body](play:signed delivery@at=sign#1)

**2. The receiver verifies before doing anything.** It recomputes the HMAC with its copy of the secret and compares. A request with no signature is rejected with 400 (or 401).
[▶ No signature: 400](play:forged and tampered@at=unsigned#1)
A real request with its body edited (o-1 changed to o-9) keeps a signature that no longer matches, so it is rejected too. The attacker cannot make a new one without the secret.
[▶ Tampered body: the signature does not match](play:forged and tampered@at=badSignature#1)
The comparison should take the same time however many characters match, or an attacker could guess a signature one character at a time by timing the answers.

**3. Reject old timestamps.** The signature proves who made a request, not when it was sent again. So the receiver rejects any request whose signed timestamp is more than 5 minutes (300 seconds) from its own clock. A captured request resent at t=400 is refused, though its signature is perfect.
[▶ Replayed after 400 s: too old](play:replay: a captured request@at=stale#3)
The timestamp is inside the signature, so the attacker cannot just update it.

**4. Retry with backoff until acknowledged.** The receiver is down until t=10. Attempts at 0, 2 and 6 get 503; each failure doubles the wait. The fourth attempt, at t=14, gets 200.
[▶ 503: back off and retry](play:retries: the receiver is down@at=backoff#1)
[▶ The fourth attempt lands](play:retries: the receiver is down@at=acked#1)
Each attempt is signed afresh with its own time, so a retry long after the event still passes the replay check.
[▶ The retry at t=14 is signed with t=14](play:retries: the receiver is down@at=sign#4)

**5. Give up loudly.** After 5 failed attempts (the last at t=30) the event is parked as a dead letter, not dropped. The customer can fix their server and replay it.
[▶ Five failures: dead letter](play:dead letter@at=deadLetter#1)

**6. Delivery is at-least-once, so the receiver dedups by event id.** The sender cannot tell a lost answer from a lost request, so it must resend; the receiver will sometimes see an event twice. It records every event id it has processed. When `evt_1` comes again it answers 200, so the sender stops, and does nothing else. o-1 is shipped once. (Here the version check in the next step would also block this exact repeat, since its version is equal. Dedup is what protects events with no version, and effects outside the order, such as an email or a call to another service.)
[▶ First delivery: processed and recorded](play:lost answer@at=processed#1)
[▶ Redelivery: 200, nothing done](play:lost answer@at=duplicate#2)
Dedup also makes a replay inside the 5-minute window harmless: it is a known event id.
[▶ Replayed at 60 s: a known id](play:replay: a captured request@at=duplicate#2)

**7. Order is not guaranteed, so keep the newest version.** The payment event for o-1 (version 1) hits a blip and is retried at t=2. Meanwhile the cancel (version 2) is sent at t=1 and lands first.
[▶ The cancel, v2, lands first](play:out of order@at=applied#1)
When the payment arrives at t=2, the receiver already has version 2, so it ignores the older event. The order stays cancelled and is not shipped.
[▶ The late v1 is ignored](play:out of order@at=olderEvent#2)
Without the version check, the late "paid" would overwrite "cancelled" and ship a cancelled order. Another fix is to treat each event as a hint and fetch the order's current state from the API.

## Why it works now

Each failure has its own guard. The signature means only the sender can make a request the receiver will act on, and the timestamp inside it bounds how long a captured copy is any use.
[▶ Old copies are refused](play:replay: a captured request@at=stale#3)
Retries with backoff mean an event is never lost while the receiver is down, only delayed, and dead letters catch the rest. Because retries make repeats unavoidable, the receiver makes repeats harmless: one event id, one effect.
[▶ A repeat changes nothing](play:lost answer@at=duplicate#2)
And because events can overtake each other, the receiver compares versions instead of trusting arrival order.

## What it costs

- **Receiver state.** The set of processed ids must be kept for longer than the sender retries, or a late retry looks new. The replay window keeps old captures out, but it does not replace dedup for honest retries.
- **Clock skew.** A receiver whose clock is minutes off rejects honest requests. Keep clocks synced with NTP and keep the window a few minutes, not seconds.
- **Latency.** A long retry schedule delivers through long outages, but late. Providers retry over hours or days on their own schedules.
- **Atomicity on the receiver.** Recording the event id and doing the work must commit together; if the receiver crashes between them, the redelivery either repeats the work or is wrongly skipped.
- **Simplifications here.** The signature is a toy hash, not HMAC-SHA256, and backoff has no jitter. Real senders add jitter so many failed deliveries do not retry at the same instant.

## Staff notes

- Receivers: verify, store the event, answer 2xx fast, then process from your own queue. A handler that takes longer than the sender's timeout causes redeliveries of events it is still working on.
- Treat webhooks as notifications, not the source of truth. For money, fetch the object from the API, and run a periodic reconciliation for events that never arrived.
- Support two active secrets per endpoint so a secret can be rotated without dropping events; sign with both during the switch.
- Senders: per-endpoint delivery logs, a replay button, and automatically disabling endpoints that have failed for days (with an email) make the system operable.
- Real layouts vary. Stripe signs `timestamp.payload` with HMAC-SHA256 in a `Stripe-Signature` header and its libraries default to a 5-minute tolerance; GitHub signs the body in `X-Hub-Signature-256`; the Standard Webhooks spec signs `id.timestamp.body` with the headers used here.

## Check yourself

- **Q:** Why can't the receiver just check that the request came from the sender's IP address and skip signatures?
  A: A sender's addresses change and are often shared with other tenants of the same cloud, and an address says nothing about whether the body was changed on the way. The signature proves the request was made with the secret and covers every byte. Without any check, anyone can make the receiver ship an order. [▶ Show it](play:broken: a receiver that trusts@at=ship#1)
- **Q:** An attacker resends a captured, correctly signed request 400 seconds later. What stops it?
  A: The signed timestamp is outside the 5-minute window, so the receiver rejects it, and the attacker cannot change the timestamp without breaking the signature. [▶ Show it](play:replay: a captured request@at=stale#3)
- **Q:** The receiver shipped o-1 but its answer was lost. What does the sender do, and how does the receiver avoid shipping twice?
  A: The sender sees a timeout and resends. The receiver finds `evt_1` in its processed ids, answers 200 and does nothing. [▶ Show it](play:lost answer@at=duplicate#2)
- **Q:** The receiver is down until t=10. When are the attempts, and which one lands?
  A: At t=0, 2 and 6 (503 each, the wait doubling), and the fourth at t=14 gets 200. [▶ Show it](play:retries: the receiver is down@at=acked#1)
- **Q:** A cancel (version 2) arrives before the retried payment (version 1). What should the receiver do with the payment?
  A: Ignore it: it already has a newer version of the order, so the order stays cancelled and is not shipped. [▶ Show it](play:out of order@at=olderEvent#2)
