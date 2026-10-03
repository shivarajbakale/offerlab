# Retry storms and retry budgets

## What it is

- **What it is:** A retry storm is many callers retrying failed requests at once, so that the retries themselves keep a service overloaded. A retry budget caps retries at a small share of normal traffic, so they cannot multiply the load.
- **The problem it solves:** When every layer of a call chain tries 3 times, one click can become 27 database queries, and a short slowdown becomes an outage that outlasts its cause. Retrying at one layer, with a budget, backoff and a short queue, lets the system recover as soon as the cause is gone.
- **Reach for it when:** Several layers (apps, gateways, client libraries, service meshes) each retry by default, a service runs without much spare capacity, or an outage kept going after its trigger was fixed.
- **Not the right tool when:** The error can never succeed (bad input, permission denied): do not retry at all. For one call with plenty of spare capacity, plain [backoff with jitter](#/sd-04-traffic/015-retry-backoff-jitter) is enough. A retried write that must not happen twice also needs [idempotency keys](#/sd-api-design/02-idempotency-keys).
- **Where you'll meet it:** The paper "Metastable Failures in Distributed Systems" (Bronson et al., HotOS 2021); Finagle's retry budgets; gRPC's retry throttling; the Amazon Builders' Library article "Timeouts, retries, and backoff with jitter"; postmortems where an outage outlasted its cause.

## Words we'll use

- **Retry** — sending a call again after it failed or timed out. The first send is the **first attempt**; each later one is a retry. "3 attempts" means the first plus up to 2 retries.
- **Layer** — one hop in the chain a request travels: here the user's app, the gateway, the Orders service and the database. Each layer calls the next.
- **Amplification** — how many attempts reach the bottom of the chain per user request. If every layer makes up to 3 attempts, it is up to 3 × 3 × 3 = 27.
- **Capacity** — the most work a service can finish per second. Here the database can run about 2,500 queries a second.
- **Timeout** — how long a caller waits for one attempt before giving up and (maybe) retrying. The callee is not told (unless the protocol propagates deadlines, as gRPC does): it still does the work.
- **Wasted work** — work finished after its caller gave up. Nobody uses the answer.
- **Metastable failure** — a failure that keeps itself going after its trigger is gone. The system has two steady states, healthy and overloaded, and a short push can move it from one to the other.
- **Exponential backoff** — waiting longer before each retry: 50 ms, then 100 ms, then 200 ms. **Jitter** multiplies each wait by a random factor, so callers that failed together do not all retry at the same instant.
- **Retry budget** — a cap on retries as a share of first attempts over a recent window: here at most 10% over the last 10 s. When the budget is spent, a failed call fails without a retry.
- **Load shedding** — refusing work at once when there is too much of it, instead of queueing it. A **bounded queue** is the simplest form: once N requests are waiting, the next one is turned away.

## The world we're in

- 1,000 requests a second. Each goes: the user's app → a gateway → Orders → one database query.
- The database can do about 2,500 queries a second and normally does about 1,000: it is about 40% busy.
- Each layer waits a bounded time for the next: the app 1 s, the gateway 500 ms, Orders 150 ms.
- From 5 s to 8 s the database runs 4 times slower (a backup job, a bad query plan): it can do about 625 queries a second for those 3 seconds. After 8 s it is perfectly healthy.
- To keep the run fast, each simulated request stands for 4 real ones; every rate and share is the same.

## The goal

During the slow spell, fail as little as we can. After it, be back to normal as soon as the database is.

## The naive attempt

"Retries make us resilient. Every layer retries a failed call up to 3 times."

Before 5 s, nothing fails and the database is about 40% busy with about 1,000 queries a second. During the spell, about 90% of requests fail. The database can still run about 625 queries a second, but its queue grows until every query waits longer than Orders' 150 ms timeout, so even the queries it finishes come back to a caller that has gone. Retries do not cause this, and they cannot fix it.
[▶ The slow spell begins](play:broken: retry at every layer@t=6)

To check, turn every retry off. During the spell about 90% of requests still fail, and from 6 s all of them do. The database is flat out the whole time and finishes about 550 queries a second that nobody is waiting for. (Without retries, though, it is back to normal as soon as the spell ends.)
[▶ Broken: no retries at all, the spell still fails](play:broken: no retries at all@t=7)

The database is healthy again from 8 s. But from 10 s to 16 s every request still fails. The database is sent about 24,000 queries a second, 24 times its normal load and nearly ten times what it can run: Orders and the gateway are retrying about 21,000 times a second. It runs about 2,500 of them, flat out. And about 2,500 answers a second, nearly everything the database can do, reach a caller that already gave up. The database is working flat out on queries nobody is waiting for.
[▶ Broken: 8 s after the database recovered, still down](play:broken: retry at every layer@t=12)

## Building it up

**1. Multiply the attempts.** The app makes up to 3 attempts. Each one reaches the gateway, which makes up to 3 attempts at Orders. Each of those makes up to 3 queries. One click can become 27 queries. On a healthy day this never shows, because almost nothing fails. On a bad day every layer retries at once.

**2. See why it does not stop.** When the database is slow, queries wait in its queue longer than Orders' 150 ms timeout. Orders gives up and sends the query again, but the first one is still in the queue: the database will run it anyway. Now there are two queries for one request, so the queue grows faster, so more queries time out, so more are retried. Once the load passes capacity, the queue never empties, and every query waits too long. The slow spell is gone, but the load it caused is enough to keep the database overloaded on its own. That is a metastable failure.
[▶ Retries keep the database at 100%](play:broken: retry at every layer@t=14)

**3. Retry at one layer.** Most of the 27 came from layers retrying each other's retries. Let only Orders retry, the layer next to the database: up to 3 queries per request. That is a big improvement and still not enough. 1,000 requests × 3 = 3,000 queries a second against room for 2,500. After the spell the database is still sent about 3,000 queries a second, stays 100% busy, and every request fails. Whether a system recovers depends on its headroom: here the database was 40% busy, and 3 attempts need it to be under 33%.
[▶ Broken: one layer of retries, still stuck](play:broken: retry at one layer@t=12)

**4. Cap retries with a budget.** The number of attempts per request is the wrong thing to limit, because on a bad day every request uses all of them. Limit the total instead: each Orders server retries at most 10% as many queries as it sends first tries, over the last 10 s. When most queries are failing, most failures are not retried. Extra load is now bounded whatever happens. The user's app gets the same rule.

**5. Back off, with jitter.** Retrying at once sends the retry into the same overload that failed it. Waiting first (50 ms, then 100 ms) gives the database time; multiplying each wait by a random factor between 0 and 2 spreads retries out instead of sending them in waves. Primitive 015 (Retry with Exponential Backoff and Jitter) shows why jitter matters.

With both, about 90% of requests still fail during the spell, for the same reason as before: the queue is longer than the timeout. But the database sees about 1,600 queries a second during the spell instead of 3,000 or 24,000 (a 10-second budget can be spent in a short burst). From 10 s on nothing fails, the database is back to about 1,000 queries a second and about 40% busy, no retries are needed, and the median request takes about 13 ms.
[▶ Budget: back to normal right after the database](play:budget: retries capped at 10%@t=11)

**6. Bound the queue (shed load).** The 90% during the spell is a queueing problem, not a capacity one. The database lets 1,000 queries wait for its 40 connections; at 625 a second that is well over a second of waiting, and Orders gives up after 150 ms. So let at most 20 wait, and refuse the next one at once. With 40 running and 20 waiting, a query waits about 60 / 625 s, roughly 100 ms, which is inside the timeout. A refused query costs the database nothing. Now about 40% of requests fail during the spell instead of 90%. That is close to the floor: with room for 625 of 1,000 a second, at least 37.5% must fail. The database does almost no wasted work, and from 10 s nothing fails.
[▶ Short queue: most requests saved during the spell](play:short queue: a bounded queue saves most@t=7)

## Why it works now

Without a budget, the load during and after a failure was a multiple of normal load, and the multiple grew with failure: 24 times at the bottom of the chain.
[▶ Broken: 24 times the normal load](play:broken: retry at every layer@t=12)
With a budget, extra load is at most a fixed share of normal load. A system that can carry that share has only one steady state: as soon as the trigger goes, so does the overload.
[▶ The same slow spell, recovered by 10 s](play:budget: retries capped at 10%@t=10)
The short queue fixes the other problem. An unbounded queue lets the database spend its scarce time on queries whose callers have already left. A queue no longer than the timeout means almost every query it runs is still wanted.
[▶ Short queue: almost no wasted work](play:short queue: a bounded queue saves most@t=6)

## What it costs

- **Fewer saved blips.** A brief failure that 3 immediate attempts would have hidden now shows up to users, because most failed calls are not retried once the budget is spent.
- **Slower retries.** Backoff adds 50-100 ms (or more) to a request that needed a retry.
- **Refused requests.** A short queue turns away requests a long one might have served after a brief spike. Size it to about a timeout's worth of work, not smaller.
- **Coordination.** "Only one layer retries" is a rule for every team in the chain, including the owners of client libraries, SDKs and service-mesh settings, which often retry by default.
- **A burst can still spend the budget.** A 10% budget over 10 s can be spent in a short burst: here the database saw about 1.6 times normal load over the 3 s spell. A shorter window or a token bucket smooths that, at the cost of more tuning.

## Staff notes

- In design reviews, ask: "What is the worst case number of attempts at the bottom of this chain?" Multiply the attempts at each layer, including client libraries and proxies.
- Retry at one layer, usually the one next to the failing dependency, and give it a budget. Finagle's retry budgets are a built-in version of this; gRPC's retry throttling (a token bucket that drains on failures) is a related built-in throttle.
- Bound queues to roughly the timeout's worth of work, and drop work whose caller has already given up (check the deadline before starting it). An unbounded FIFO turns "a bit over capacity" into "nothing succeeds".
- Retries need headroom: a service at utilization u can absorb at most about 1/u attempts per request before it is overloaded. At 40% that is 2.5.
- Never retry an error that means "I am overloaded" without backoff, and do not retry errors that cannot succeed (bad input, permission denied).
- Count retries and wasted work. A rise in retries is often the first sign of a retry storm; by the time errors spike, it is already running.
- If you are stuck in a metastable state, cut the load: turn off retries, shed traffic at the edge, or rate-limit until the backlog drains. Waiting does not help.

## Check yourself

- **Q:** The database recovered at 8 s. Why was every request still failing at 12 s?
  A: Retries at every layer sent it about 24 times the normal load. Queries waited past their timeouts, were retried, and the abandoned ones still ran. [▶ Show it](play:broken: retry at every layer@t=12)
- **Q:** Only Orders retries, 3 attempts. Why does the system still not recover?
  A: 3 attempts × 1,000 requests = 3,000 queries a second against room for 2,500. The database was 40% busy, so it can absorb at most 2.5 attempts per request. [▶ Show it](play:broken: retry at one layer@t=12)
- **Q:** What does the retry budget change, if most requests still fail during the slow spell?
  A: It bounds the extra load at a small share of normal load, so once the database recovers there is no overload left to sustain itself. [▶ Show it](play:budget: retries capped at 10%@t=11)
- **Q:** With no retries at all, why do about 90% of requests still fail during the slow spell, and what saves most of them?
  A: The database still runs about 625 queries a second, but its long queue makes every query wait past Orders' 150 ms timeout. A short queue that refuses the excess at once (load shedding) keeps waits inside the timeout: about 40% fail instead of 90%. [▶ Show it](play:short queue: a bounded queue saves most@t=7)
- **Q:** What is the work the database does for callers that gave up, and how much was there?
  A: Wasted work: queries finished after Orders had timed out on them. About 2,500 a second, nearly all of its capacity. [▶ Show it](play:broken: retry at every layer@t=14)

## Deep dive

Why does "headroom" decide whether retries are safe? Say a service is at utilization u (here 0.4) and, during an incident, every request uses all its attempts. Load becomes k × u, where k is the attempts per request. If k × u is above 1, the service is overloaded, every attempt is slow, and every request keeps using all k attempts: the overload holds itself up. With k = 27 that happens at any utilization above about 4%; with k = 3, above 33%. A retry budget of 10% means k is at most about 1.1 in steady state, which only overloads a service already above 90%. This is also why autoscaling does not reliably fix a retry storm: the added capacity is consumed by the multiplied load.
