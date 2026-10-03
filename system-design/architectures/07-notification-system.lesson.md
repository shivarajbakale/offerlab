# Notification system

## What it is

- **What it is:** A shared service that other parts of a company call to tell a user something happened, such as "your order shipped", and that delivers it by phone push, email or text message through outside providers.
- **What makes it hard:** Every channel depends on an outside provider that can slow down without warning, and if callers wait on those calls, one slow provider takes down the whole service. Queued jobs can also be handed out twice, so a user may get the same message twice.
- **Building blocks it uses:** delivery taken out of the request and onto queues ([async events between services](#/sd-microservices/06-async-events-between-services)), a separate queue and consumer pool per channel ([bulkheads](#/sd-microservices/05-bulkheads)), [retries with backoff and jitter](#/sd-04-traffic/015-retry-backoff-jitter), and repeats skipped by notification id ([idempotent consumers](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)).
- **Where you'll meet it:** "Design a notification system" is a common interview question. Apple's APNs and Google's FCM deliver phone pushes; Amazon SES and SendGrid send email, and Twilio sends text messages. Most large products run one internal service like this in front of them all.

## Words we'll use

- **Notification** — a message to a user that something happened, like "your order shipped".
- **Channel** — a way to reach the user: a **push** notification to their phone, an **email**, or a text message (**SMS**).
- **Provider** — an outside company that delivers a channel for us (Apple's and Google's push services, an email service, an SMS gateway). We call it over the internet and cannot make it faster.
- **Caller** — one of our other services (orders, payments) asking us to notify a user, or reading a user's settings and inbox.
- **Request** — one call to our notification API. **Requests a second** is how much traffic arrives.
- **Latency** — how long a request takes, from sending it to the answer. **p50** is the middle one (half were faster); **p99** is the one 99% were faster than.
- **Worker** — a slot for one request in progress inside the API server. It stays taken while its request waits on anything, including a provider.
- **Rejected** — turned away with an error because every worker is taken and the waiting line is full. **Timeout** — the caller gave up waiting (here after 1 s).
- **CPU core** and **utilization** — a core runs one piece of work at a time; utilization ("busy") is the share of time it is working.
- **Queue** — a list of jobs to do later. The request adds jobs and returns at once; **consumers** take jobs off the list and do them, one job each at a time.
- **Backlog** — jobs on the queue not yet taken. The **oldest job's age** is how long the oldest of them has waited: how late its notification will be, at least.
- **Bulkhead** — a wall that keeps a flood in one compartment. Here: separate queues and consumers per provider, so one slow provider cannot use up everyone's consumers.
- **Headroom** — spare capacity beyond what a normal day needs, used to catch up after a bad minute.
- **Little's law** — the number of jobs in progress equals the rate they arrive times how long each takes. 300 jobs a second × 0.125 s each = 37.5 jobs in progress, so 37.5 consumers busy.
- **At-least-once delivery** — a queue's promise that a job will be handed to a consumer until it is confirmed done; it may be handed out more than once.
- **Idempotent** — safe to do twice: doing it again changes nothing. **Deduplication** — noticing a repeat and skipping it.
- **Retry with backoff** — trying a failed job again after a wait that grows each time. **Jitter** — a random amount added to each wait, so jobs that failed together do not all retry at the same instant. A **dead-letter queue** holds jobs that kept failing, for a person to look at.

## The world we're in

- Callers send 1,000 requests a second. 70% read a user's settings or inbox; 30% ask us to send a notification, 300 a second.
- Each notification goes out on all three channels: 900 provider calls a second.
- Each provider answers in about 100 ms and is 10 ms away. Providers slow down without warning; we model the SMS provider becoming 10 times slower (1 s a message) for 5 seconds.
- The callers do not need the message delivered before they continue. They need to know we accepted it.
- A push notification that arrives a minute late is nearly useless ("your driver is here"); an email a minute late is fine.

## The goal

Answer callers fast whatever the providers do, deliver each channel as quickly as its provider allows, and make sure one slow provider delays only its own channel.

## The naive attempt

"When a caller asks us to notify a user, call the push, email and SMS providers, then answer."

On a good day it works: reads take about 46 ms, and a notification request waits for three providers in a row, up to about 0.6 s. That already holds about half of the API's workers.
[▶ Sending inside the request on a good day](play:send inside the request: fine@t=4)

At 5 s the SMS provider becomes 10 times slower. Each notification request now holds a worker for over a second, longer than callers wait. The workers fill up while the API's CPUs sit at 8% busy, and requests that have nothing to do with SMS are rejected or time out: about 65% of all requests fail, although only 30% of them send anything.
[▶ Broken: a slow SMS provider fails unrelated reads](play:broken: send inside@t=8)

A worker waiting on a provider is a worker nobody else can use. The provider's slowness became our outage.

## Building it up

**1. Take the providers out of the request.** The API saves the notification, drops three jobs (one per channel) on a queue, and answers. Consumers take jobs off the queue and call the providers. With the same slow SMS provider, callers notice nothing: no errors, and p99 stays under 60 ms. Few API workers are ever in use.
[▶ The same slowdown with one queue](play:one queue:@t=8)
The caller now hears "accepted", not "delivered". That is the contract a notification service should offer anyway: delivery depends on providers we do not control.

**2. One queue for every channel delays every channel.** The jobs on the queue are push, email and SMS jobs mixed together, and 210 consumers take them in order. While SMS is slow, every SMS job holds its consumer for 1 s instead of 0.1 s, so the consumers are soon all busy, mostly with SMS. Push and email jobs wait in the same line behind them: at 10 s there are about 1,800 jobs waiting and the oldest has waited about 2 s, push jobs included. The line is empty again about 4 s after SMS recovers.
[▶ Broken: push waits behind SMS in one queue](play:broken: one queue@t=10)

**3. A queue per channel (a bulkhead).** Give each channel its own queue and its own 70 consumers. A slow SMS provider can now only hold SMS consumers. Push and email jobs are taken within milliseconds the whole time, while SMS jobs pile up: about 1,100 waiting at 10 s, the oldest about 3.7 s old.
[▶ Push and email keep flowing while SMS backs up](play:a queue per channel@t=10)
Notice the trade: SMS waited longer here (3.7 s) than in the shared queue (2 s), because it can no longer borrow the other channels' consumers. That is the point. A bulkhead gives up sharing so that one failure stays in its compartment.

**4. Size each channel's consumers with arithmetic.** A job holds its consumer for about 125 ms: 5 ms of our own work, 10 ms to the provider, 100 ms there, 10 ms back. 300 SMS jobs a second × 0.125 s = 37.5 consumers busy all the time (Little's law). Give SMS 25 consumers and they can finish 25 / 0.125 = 200 jobs a second: 100 short. The backlog grows by about 100 a second on a perfectly good day, the oldest SMS is 5 s late by 15 s and getting later, and callers see no error at all.
[▶ Broken: 25 SMS consumers for 38 consumers' worth of work](play:broken: too few@t=15)

**5. Then add headroom.** 40 consumers are just above 37.5: 37.5 / 40 ≈ 94% of their time is needed, and they measure 97% busy, fine on a good day. But after a 5-second slowdown leaves about 1,400 jobs waiting, they can only finish 40 / 0.125 = 320 a second against 300 arriving: 20 a second to spare, so 1,400 / 20 ≈ 70 s, a minute or more, to catch up. At 15 s, five seconds after the provider recovered, the backlog has barely shrunk (about 1,300 jobs) and the oldest SMS is about 4.5 s late.
[▶ Broken: just enough consumers, after a slowdown](play:broken: just enough@t=15)
With 70 consumers (about 1.8 times the need, half busy on a good day) the spare is 70 / 0.125 − 300 = 260 jobs a second. The slow 1 s jobs already in progress finish first, then about 1,100 jobs / 260 a second ≈ 4.5 s: the backlog is gone 6 s after the provider recovers.
[▶ Consumers with headroom drain the backlog](play:consumers with headroom@t=16)

## Why it works now

Each kind of waiting is confined to where it belongs. Callers wait only for a database write and a queue, so they never wait on a provider. Each channel's consumers wait only on their own provider, so a slow SMS provider delays SMS and nothing else. Each pool is sized from its rate and job time, with enough spare to drain what a slowdown leaves behind. Compare: inside the request, one slow provider failed about 65% of all requests; now the same slowdown shows up only as an SMS backlog that drains seconds later.

## What it costs

- Callers no longer learn whether a message was delivered. If they need to know, we must record delivery results and offer a way to look them up.
- Three queues and three consumer pools to size, run and alert on instead of one; idle headroom in each.
- A queue delivers at least once, so every consumer must be safe to run twice (see Staff notes).
- A notification can now be late without anyone seeing an error. Someone must watch each queue's oldest job age.
- In our setup the bulkhead made SMS itself slower to recover (3.7 s versus 2 s behind) in exchange for push and email being unaffected.

## Staff notes

- **At-least-once delivery.** A queue hands a job to a consumer and only deletes it when the consumer confirms. If the consumer crashes after the provider sent the SMS but before confirming, the job is handed out again and the user gets the SMS twice. Queues cannot avoid this: the alternative, deleting before sending, loses messages when a consumer crashes.
- **Deduplication.** Give every notification an id when the caller asks (or let the caller pass one, an idempotency key). Before calling the provider, record "sending id X"; skip any job whose id is already recorded as sent. That narrows the gap but cannot close it: a crash between the provider's send and our "sent" record still sends twice. Most providers cannot help: the main email and SMS APIs (Amazon SES, Twilio Messaging) and the push services (APNs, FCM) take no idempotency key. Push has a partial fix: APNs's `apns-collapse-id` and FCM's `collapse_key` make the phone show only the newest of several notifications with the same id, so a duplicate replaces the first instead of appearing twice. A duplicate email or SMS can only be made rarer, by our own record; some SMS aggregators do accept a key.
- **Retries.** Retry failed provider calls with exponential backoff and jitter, and cap the attempts. After the cap, move the job to a dead-letter queue and alert. Never retry immediately in a loop: that multiplies load on a provider that is already struggling.
- **Expiry.** Give each job a deadline per channel. A "your driver is here" push that is 10 minutes late should be dropped, not sent.
- **Fail over.** For important channels keep a second provider; when one's error rate or latency crosses a threshold, route new jobs to the other.
- **Rate limits.** Providers limit how fast we may send. Size consumers so we cannot exceed them, and per user, cap how many notifications one person can receive in an hour.
- **Priority.** Within a channel, separate queues for urgent messages (security codes) and bulk ones (newsletters), so a marketing blast cannot delay a login code.
- Alert on each queue's oldest job age against that channel's tolerance, not on its length: 1,000 emails waiting may be fine, 1,000 one-time passcodes is an outage.

## Check yourself

- **Q:** The SMS provider slows down, and reads of user settings start failing. Why, when reads never touch SMS?
  A: Notification requests hold API workers while waiting on SMS. When every worker is held, reads have no worker and are rejected or time out. [▶ Show it](play:broken: send inside@t=8)
- **Q:** With one shared queue, callers are fine during the SMS slowdown. What is still wrong?
  A: Push and email jobs wait in the same line behind slow SMS jobs: the oldest job waits about 2 s, push included. [▶ Show it](play:broken: one queue@t=10)
- **Q:** 300 SMS a second, each holding a consumer for 125 ms. How many consumers do you need, and what happens with 25?
  A: 300 × 0.125 = 37.5 busy all the time. With 25 the queue falls 100 jobs a second further behind, with no error anywhere. [▶ Show it](play:broken: too few@t=15)
- **Q:** 40 consumers cover the 37.5 needed. Why is that still not enough?
  A: After a slowdown leaves a backlog, they have only 20 jobs a second to spare, so it takes a minute or more to catch up: at 15 s the backlog has barely shrunk. 70 consumers clear it 6 s after the provider recovers. [▶ Show it](play:broken: just enough@t=15)

## Deep dive

Why does a backlog take so long to drain with little headroom? Say a channel gets λ jobs a second and its consumers can finish μ a second when the provider is healthy. During a slowdown the consumers finish fewer, and a backlog B builds up. Afterwards it shrinks by μ − λ a second, so it takes B / (μ − λ) seconds to drain. With 40 consumers, μ = 320 and λ = 300: 1,400 / 20 ≈ 70 s. With 70, μ = 560: 1,100 / 260 ≈ 4.5 s (plus the second it takes the slow jobs in progress to finish). Doubling the spare halves the time, and with spare near zero the backlog barely drains: random bursts of arrivals refill much of what the consumers clear.

Why not one big pool with a limit per channel, instead of separate queues? That works too: it is the same bulkhead built differently, a cap on how many consumers any one provider may hold at once. Separate queues are simpler to see and to alert on, and each can have its own retry policy and deadline.

Simplifications in this model: every provider takes the same 100 ms; each notification goes out on all three channels; in the one-queue stage the providers are drawn as one component with three machines that take jobs in turn (push, email, SMS), because the simulator's queues send every job to the same place; retries, failures and deduplication are described, not simulated.
