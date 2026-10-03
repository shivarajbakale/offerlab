# Checkout and payments

## What it is

- **What it is:** The part of an online shop that turns a cart into an order and charges the shopper's card through an outside payment provider such as Stripe or Adyen.
- **What makes it hard:** When a payment call times out, the shop cannot tell whether the card was charged, so a careless retry charges twice. The provider is slow on bad days, and checkouts waiting on it can hold every server worker, so page views that never touch payments fail too.
- **Building blocks it uses:** [idempotency keys](#/sd-api-design/02-idempotency-keys) so every try of one payment charges at most once, a separate worker pool for checkout ([bulkheads](#/sd-microservices/05-bulkheads)), and payment jobs on a queue, saved together with the order through a [transactional outbox](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer).
- **Where you'll meet it:** "Design a checkout" or "Design a payment system" comes up in interviews at commerce and fintech companies. Stripe's API accepts an Idempotency-Key header on its POST requests for exactly this reason, and many shops take the order first and charge the card in the background.

## Words we'll use

- **Request** — one thing a shopper asks the shop for. A **page view** reads product pages; a **checkout** places an order and pays for it.
- **Requests a second** — how much traffic arrives.
- **Latency** — how long one request takes. **p50** is the middle latency of a second's worth of successful requests; **p99** is the one 99% were faster than: the slow tail.
- **Payment provider** — an outside company (a card processor) that charges the card. We call it over the network and cannot make it faster.
- **Charge** — the provider taking money from the shopper's card. Charging the same order twice is a **double charge**.
- **Worker** — a slot for one request in progress on an app server. It stays taken while its request waits for anything, including the payment provider. Each app server here has 60.
- **CPU** — the part of a machine that does the work. "Workers full, CPU idle" means requests are waiting, not working.
- **Queue (of a server)** — requests waiting for a free worker. When it is full, the next request is turned away with **503** ("service unavailable").
- **Timeout** — how long the shopper's app waits before it gives up and shows an error. The server is not told; it carries on.
- **Retry** — sending the request again after an error or a timeout. Here the shopper's app lets them press Pay again, up to 3 tries.
- **Idempotency key** — a unique id the shop makes once per order and sends with every try of that payment. The provider remembers keys it has seen: a repeat gets the first answer back instead of a second charge. If the first try is still running when the repeat arrives, the provider cannot answer yet; Stripe, for example, answers **409 Conflict** with the error code `idempotency_key_in_use`, and the caller tries again a little later. **Idempotent** means "doing it twice has the same effect as doing it once".
- **Bulkhead** — a separate pool of workers for one kind of work, so that when it gets stuck it can use up only its own pool. Named after the walls that split a ship's hull, so one leak floods one compartment.
- **Job queue** — a list of jobs to do later. The request adds a job and returns; **consumers** take jobs off and do them. The **backlog** is the jobs still waiting.
- **Acknowledge and redelivery** — a consumer that takes a job only hides it; the queue deletes it when the consumer says "done" (acknowledges). If no "done" arrives within a **visibility timeout** (the consumer died, or the call failed), the job becomes visible again and is **redelivered** to another consumer. Here a failed job comes back after 1 second.
- **Order states** — "payment pending", "paid", "payment failed": what the shop records about each order as it goes.
- **Authorize and capture** — two steps of a card payment: **authorize** puts a hold on the money; **capture** actually takes it, often later.
- **Reconcile** — compare our records of payments with the provider's, line by line, to find any that disagree.
- **Circuit breaker** — a switch in the caller that stops calling a service that keeps failing, for a while, and fails at once instead.
- **Outbox** — a table in the shop's own database where a job is written in the same transaction as the order, so the order and its job are saved together or not at all. A **transaction** is a group of database changes that either all happen or none do.

## The world we're in

- 1,000 requests a second: 90% page views, 10% checkouts (100 a second).
- Three app servers, 60 workers each: 180 requests can be in progress at once.
- A page view needs 6 ms of app CPU and a quick database read. A checkout needs 8 ms, writes the order, and then calls the payment provider.
- The provider usually answers in about 300 ms. Sometimes it is 3 times slower; on a bad day, 10 times slower (3 seconds). That happens here from 4.5 s to 8.5 s.
- Shoppers who see an error, or wait past their app's timeout, try again, up to 3 tries.
- **What the simulator models and what it does not.** It models workers, queues, timeouts, retries and the provider's speed. It does not model money. A payment the provider completed after the shopper had already given up is counted ("finished after the client gave up"); we read each of those as a charge the shopper was told had failed, which their retry then charges again. Idempotency keys, circuit breakers and order states are explained here, not simulated.

## The goal

Charge every order exactly once. Keep page views fast whatever the payment provider does. Take as many orders as possible while it is slow.

## The naive attempt

"Do it all in the request: save the order, call the provider, wait for the answer, show 'Paid'. The shopper's app gives up after 1 second."

On a normal day this works. Every request succeeds, the median takes 50 ms, and the slowest checkouts about 550 ms (mostly the provider's 300 ms). Workers are 22% busy.
[▶ Pay inside the request, a normal day](play:pay inside the request: on a normal day@t=5)

Now the provider gets 3 times slower: about 0.9 s a payment, often more. Many checkouts pass the 1-second timeout. The shopper sees an error and presses Pay again. But the first request did not stop: our server was still waiting on the provider, and the provider finished the charge. From 4.5 s on, about 210 payments complete after their shopper gave up, and those shoppers had already sent a second try. Almost every checkout ends in "success", some of them twice.
[▶ Broken: payments that finish after the shopper gave up](play:broken: pay inside the request@t=8)
Even on a normal day this happens now and then: a payment that takes more than a second is rare, but in 15 seconds a handful do.

## Building it up

**1. Make every payment try carry the same idempotency key.** The double charge comes from a simple fact: when a request times out, the caller cannot know whether the work happened. Was the card charged and the answer lost, or never charged? A retry must be safe either way. So the shop makes one key per order (say, the order id) when the order is first saved, and sends it with every call to the provider. The provider stores each key with its result. A second call with the same key, once the first has finished, returns the stored result: charged once, answered twice. If the first call is still running, the repeat is refused (Stripe answers 409 Conflict) and the caller tries again later; it is never run a second time. Our own checkout endpoint does the same: the shopper's app sends the key, and a repeated key returns the existing order instead of creating another. This does not change any number in the simulator, because the simulator does not model money; it is what turns those 210 late payments from double charges into harmless repeats.

**2. Wait long enough.** Should a shopper's app give up after 1 second on a call that normally takes 300 ms and sometimes 1 s? A timeout should be longer than a slow-but-working answer, or every slow day turns into retries. With a 10-second timeout and the same 3-times-slower provider, nobody times out, no payment finishes after its shopper left, and every request succeeds. Workers are busier (52%) but there are enough.
[▶ Longer timeout, the same slow provider](play:longer timeout@t=7)

But a longer timeout also means each worker can be held longer. Now the provider is 10 times slower: 3 seconds a payment. 100 checkouts a second × 3 seconds = 300 workers needed, and there are 180. Within about two seconds every worker is waiting on the provider, while the CPUs are only about a third busy. New requests queue, the queues fill, and requests are turned away with 503: 21% of all requests from 5.5 s to 8.5 s. Checkouts are only 10% of traffic, so most of those failures are page views that never touch the provider. The median page view slows from 50 ms to over 100.
[▶ Broken: a slow provider takes every worker, and page views fail](play:broken: longer timeout@t=7)
This is the same trap as the email provider in "Scale a web app": anything that shares workers with a slow call fails with it.

**3. Give checkout its own pool (a bulkhead).** Move the payment call into a separate checkout service with its own 60 workers and a short queue of 10. The app servers pass each checkout to it and wait. When the provider is 10 times slower, those 60 workers fill, and the next checkout is refused at once, so at most 70 app workers (60 checkouts in progress plus 10 queued) can ever be waiting on checkout. Page views keep the rest. From 5.5 s to 8.5 s the app servers' workers are 44% busy, the median page view is still 50 ms, and the only failures are checkouts.
[▶ Bulkhead: page views untouched during the outage](play:separate pool: during@t=7)
The cost is checkout itself. 60 workers at 3 seconds a payment finish 20 checkouts a second out of 100, so about 84% of checkouts fail while the provider is slow (8.4% of all requests, against 10% that are checkouts). The bulkhead decided who fails; it did not make the provider faster.
[▶ Broken: most checkouts fail while the provider is slow](play:broken: separate pool@t=7)
A circuit breaker (primitive 016, "Circuit Breaker") is the natural partner: after enough failures, stop calling the provider for a few seconds and fail checkouts at once, instead of holding 60 workers for 3 seconds each.

**4. Accept the order, pay from a queue.** Does the shopper have to wait for the card to be charged? Usually not. The request saves the order as "payment pending", puts a payment job on a queue, and answers "Order received" in about 50 ms. 60 consumers take jobs off the queue, call the provider with the order's idempotency key, mark the order "paid" or "payment failed", and email the shopper.

With the same 10-times-slower provider, shoppers notice nothing: no errors, p99 62 ms, page views and checkouts alike. The consumers fall behind instead. Normally 30 consumers are busy (100 a second × 0.3 s); during the outage the work needs 300, so jobs pile up: about 360 waiting at 10 s, the oldest about 3.5 seconds old. Once the provider recovers at 8.5 s, payments already started still take up to 3 seconds to finish; after that 60 consumers do 200 payments a second against 100 arriving, so the backlog shrinks by about 100 a second: under 200 at 14 s, under 100 at 15 s.
[▶ The same outage with a payment queue](play:queue: the same outage@t=10)
What if the provider is down outright from 4.5 s to 8.5 s, refusing every call? Then each payment try fails at once. The consumer never says "done", so the job comes back on the queue a second later (redelivery) and is tried again, with the same idempotency key. Shoppers still see no errors. Each try still holds a consumer for its 0.3 s of work, and every waiting job comes back for another try, so by 8.5 s the 60 consumers are busy all the time on tries that fail. About 360 orders are waiting by then: about 150 visible, the rest hidden until their next try. The oldest has waited almost 5 seconds; a retry does not reset a job's age. Every order is paid by 12 s.
[▶ The provider down, and failed payments retried from the queue](play:queue: the provider down@t=8.5)
A queue hides the outage from shoppers; it does not end it. If the provider stays slow for 10 seconds, the backlog keeps growing: about 730 orders unpaid at 14 s, the oldest over 7 seconds old, and more every second. In real life outages last minutes or hours, so the shop must decide what an unpaid order means: hold it, do not ship it, and tell the shopper if the charge fails later.
[▶ Broken: a long outage leaves hundreds of orders unpaid](play:broken: queue@t=14)

## Why it works now

The payment call no longer holds anything shoppers are waiting on. The request only writes the order and a job, both inside our own systems; the slow, uncertain call to the provider happens in the background, where waiting costs a consumer and nothing else. Every try of a payment carries the order's idempotency key, so timeouts and retries, ours or the shopper's, can never charge twice. And nothing is lost if a consumer dies halfway: the queue deletes a job only when a consumer acknowledges it, so an unfinished job is redelivered after its visibility timeout and tried again with the same key, while the order's state records exactly where each payment is.

## What it costs

- Shoppers get "Order received", not "Paid". Some cards will be declined after the shopper has left; the shop needs an email, a way to retry the card, and a rule about shipping unpaid orders.
- The order and its job must be saved together. If the order is saved and the job is lost (a crash between the two), the order is never paid. The usual fix is an outbox (primitive 026, "Transactional Outbox and Idempotent Consumer").
- A queue and consumers to run and watch: $1.03 an hour here instead of $0.88. Alert on the backlog and the age of the oldest job.
- A bulkhead costs another server ($1.05 an hour in stage 3), and its size is a guess: too small refuses checkouts on a normal busy day, too large protects nothing.
- Idempotency keys must be stored, with their results, for as long as a retry might arrive. Stripe keeps them for at least 24 hours; other providers differ, so check yours.

## Staff notes

- **The timeout decides what the caller knows.** After a timeout, the work may or may not have happened. Every call that changes something (charge, refund, send) must be safe to repeat, which in practice means an idempotency key chosen by the caller before the first try.
- **Make the key before you call.** Save the order with its key first, then call the provider. If the process dies after the charge but before recording it, a background job can ask the provider "what happened to this key?" and fix the order. Never generate the key inside the retry loop: each try would get a new one.
- **Timeouts should come from the provider's real latency.** Set them above the provider's p99 on a bad day, and below what the caller can afford to hold a worker for. If those two cross, the call belongs on a queue.
- **Bulkhead by dependency.** Give each slow outside service its own pool (or its own concurrency limit), sized from rate × latency on a bad day. Watch for pools that are full on a normal day.
- **Payments are a state machine.** pending → authorized → captured → refunded, with each move recorded. Many shops authorize the card at checkout (a hold) and capture the money when the goods ship.
- **Reconcile.** Even with keys, compare your records with the provider's every day. Mismatches will happen; find them before customers do.
- **What the simulator left out.** It cannot tell a double charge from a single one, so it shows the payments that finished after the shopper gave up and leaves the money to you. Its queue retries a failed payment after 1 second, every time, with no backoff and no limit; a real consumer should back off and, after some tries, mark the order "payment failed". There is no circuit breaker; it is explained above.

## Check yourself

- **Q:** The shopper's app timed out and showed an error. Was the card charged?
  A: Maybe. The server did not stop when the shopper gave up; many of those payments finished anyway. That is why a retry must carry the same idempotency key. [▶ Show it](play:broken: pay inside the request@t=8)
- **Q:** With a 10-second timeout and a provider 10 times slower, why do page views fail, when they never call the provider?
  A: They share the app servers' workers with checkouts. 100 checkouts a second × 3 seconds need 300 workers; there are 180, so every worker is waiting on the provider and page views find none free. [▶ Show it](play:broken: longer timeout@t=7)
- **Q:** What does a bulkhead fix, and what does it not?
  A: It keeps a stuck dependency from taking every worker, so page views stay fast. It does not make checkouts succeed: most fail while the provider is slow. [▶ Show it](play:broken: separate pool@t=7)
- **Q:** With payments on a queue, the provider is slow and shoppers see no errors. Where did the problem go?
  A: Into the queue: hundreds of orders wait unpaid, the oldest for seconds. Someone must watch the backlog's age and decide what happens to unpaid orders. [▶ Show it](play:broken: queue@t=14)

## Deep dive

How many workers does a slow call take? Little's law: the average number of requests in progress equals the arrival rate times the time each one spends. 100 checkouts a second × 0.3 s = 30 workers on a normal day; × 0.9 s = 90 when the provider is 3 times slower; × 3 s = 300 at 10 times. Nothing about our own servers changed, yet the workers checkout needs went up tenfold. That is why sizing a pool from the normal day fails, and why a slow outside call is safest where its waiting costs only a consumer, not a worker a shopper is waiting on.
