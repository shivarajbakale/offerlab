# Public API with rate limits

## What it is

- **What it is:** The front door of a public API: for each request it checks the caller's key and decides whether the request may go through now or must be refused with "too many requests". It also decides how the servers behave when they slow down.
- **What makes it hard:** A few heavy callers can fill the servers and make the API slow and unreliable for everyone else. A limit must refuse them cheaply without punishing normal callers whose requests come in clumps, it cannot stop the sum of many well-behaved callers from overloading the servers, and it must hold across many gateway machines at once.
- **Building blocks it uses:** a [token bucket](#/sd-04-traffic/012-token-and-leaky-bucket) per API key, with [window rate limiters](#/sd-04-traffic/013-window-rate-limiters) as the other way to count, [load balancing](#/sd-04-traffic/014-load-balancing) across the app servers, and clients that use [retries with backoff and jitter](#/sd-04-traffic/015-retry-backoff-jitter).
- **Where you'll meet it:** GitHub, Stripe and most public APIs publish per-key limits and refuse requests past them; 429 Too Many Requests is the standard answer. Stripe's engineering blog describes token-bucket limiters kept in Redis. "Design a rate limiter" is a common interview question, usually followed by "now across many servers".

## Words we'll use

- **API** (application programming interface) — a service that programs call instead of people clicking pages. A **client** here is one such program, identified by its **API key**: a secret string it sends with every request so we know who is calling.
- **Request** — one call to the API. **Requests a second** is how much traffic arrives.
- **Latency** — how long one request takes, from the client sending it to the answer arriving.
- **p50 and p99** — sort the latencies of a second's worth of successful requests. **p50** is the middle one; **p99** is the one 99% were faster than: the slow tail.
- **CPU core** — one part of a processor that runs one piece of work at a time. **Utilization** (or "busy") is the share of time the cores are working.
- **Capacity** — the most requests a second the servers can finish. Here each request needs 6 ms of CPU, so one 4-core server can do 4 / 6 ms ≈ 667 a second.
- **Worker** — a slot for one request in progress on a server. Each server has 50.
- **Server queue** — requests waiting for a free worker. When it is full, the next request is turned away with **503** ("service unavailable").
- **Timeout** — how long a client waits before giving up. Here, 1 second. The server does not know the client gave up, so it may still do the work: **wasted work**.
- **Load balancer** — the component in front of the servers that hands each request to one of them.
- **Rate limit** — a rule that each client may send only so many requests a second. A request over the limit is answered at once with **429** ("too many requests") and never reaches a server.
- **Token bucket** — one way to enforce a rate limit. Each client has a bucket. Tokens drip in at a **steady rate** (10 a second here); the bucket holds at most **burst** tokens (20 here). Each request takes one token; with none left, 429.
- **Retry** — the client sends a request again after an error or a timeout. **Backoff** means waiting before the retry, longer each time; **jitter** means making that wait a little random, so clients that failed together do not all come back together.
- **Load shedding** — turning work away quickly on purpose when there is too much, so the work you do accept finishes in time.
- **Gateway** — a load balancer that also checks keys and limits; large APIs run many of them side by side.
- **Redis** — a fast in-memory store that many machines can share over the network; often used to keep counters.
- **Atomic** — done as one indivisible step: no other machine can act between its parts.
- **Retry-After** — a header on a 429 or 503 that tells the client how many seconds to wait.
- **Fixed window and sliding window** — two other ways to count requests for a limit: count per calendar second or minute (fixed), or over the last second or minute at any moment (sliding).

## The world we're in

- 200 client programs call the API. Each sends requests at random moments, so they arrive in clumps, not evenly spaced.
- 196 normal clients send about 5 requests a second each: 960 a second together.
- 4 heavy clients (a scraper, an integration stuck in a loop) send about 360 a second each: 1,440 a second together, 60% of all traffic.
- Three app servers, each with 4 cores, 50 workers and room for 100 waiting requests. Every request costs 6 ms of CPU, so the three can finish about 2,000 a second.
- Clients give up after 1 second.
- Our own servers sometimes get slower for a while (a bad deploy, a busy shared machine), and we only find out when it happens.

## The goal

Keep the API fast for the clients who behave, whatever a few heavy clients do. Stay useful when our own servers slow down. Know how many servers the API needs as it grows.

## The naive attempt

"Let everyone send as much as they like. We have plenty of servers."

The servers can finish about 2,000 requests a second; 2,400 arrive. The extra 400 a second cannot be done. The cores are 100% busy, every worker is taken, every queue is full, and about 1 request in 6 (16%) is turned away with a 503. The ones that get in wait in line: the median request takes 264 ms instead of 48.

Nothing here picks on the heavy clients. A normal client's request is just as likely to be turned away, and waits just as long. Four clients out of 200 made the API slow and unreliable for the other 196.
[▶ Broken: four heavy clients fill the servers](play:broken: no limits@t=6)

## Building it up

**1. Give each client a token bucket.** The load balancer keeps one bucket per API key. Tokens drip in at 10 a second, up to 20. Each request takes a token. With no token, the load balancer answers 429 at once, without bothering a server.

A normal client sends about 5 a second, half the drip rate, so its bucket stays nearly full and it never notices. A heavy client sends 360 a second; it gets 10 through and 350 are refused. 58% of all requests now get a 429, and every one of them is a heavy client's. The servers see only about 1,000 a second, are 50% busy, and answer in 48 ms at the median and 58 ms at p99. No 503s at all.
[▶ The rate limit: 429s for heavy clients, fast answers for the rest](play:rate limit: heavy clients@t=6)

A 429 costs almost nothing: the load balancer checks a counter and answers. That is why rejecting at the front door is so much cheaper than letting a request in and failing it later.

**2. Allow a burst.** Why let a bucket hold 20 tokens when the steady rate is 10? Because normal clients do not send evenly. A client that averages 5 a second often sends two requests within 100 ms of each other. With a bucket of 1 token, the second one finds the bucket empty and gets a 429, even though the client is far under its rate. Here that happens to about a third of normal clients' requests: 429s rise from 58% of all traffic to 71%, and the extra 13 points are all normal clients'.
[▶ Broken: a bucket of 1 token rejects normal clients](play:broken: no burst@t=6)
The burst is the size of a clump you forgive. The steady rate is what a client may average. A bigger burst lets a heavy client hit hard for a moment (here, 20 extra requests at once), which the servers absorb easily.

**3. When our servers slow down, shed load fast.** Now every app server runs 4 times slower for 3 seconds, from 3.5 s to 6.5 s. Each server can finish only about 167 a second, 500 for all three, while about 1,000 a second get past the limit. Something has to give.

A tempting fix for the 503s is a deeper queue: let each server hold 400 waiting requests instead of 100. But at 167 a second, the last of 400 waiting requests starts after 2.4 seconds, and the client gave up after 1. The queue fills with requests whose clients are gone. The servers do that work anyway: over the five seconds from 3.5 s to 8.5 s they finish about 1,600 requests nobody is waiting for, 14% of requests time out, and a second after the slowdown has ended the slow tail is still 400 ms because the servers are still working through the old line.
[▶ Broken: deep queues fill with requests nobody is waiting for](play:broken: deep queues — requests@t=6)
A useful queue is never longer than timeout × the rate the server finishes work: here 1 s × 167 a second during the slowdown. 100 fits; 400 does not.

Clients make it worse when they retry at once. A request that got a 503 comes straight back to a queue that is still full; a heavy client's 429 comes straight back to a bucket that is still empty. 3,600 retries a second arrive during the incident, and the successful requests' slow tail grows to 2.7 seconds, because latency is counted from the first try (primitive 015, "Retry with Exponential Backoff and Jitter").
[▶ Broken: deep queues and clients that retry at once](play:broken: deep queues with immediate retries@t=7)

The fix is two small changes. Keep the queues short (100), so a request that cannot be served soon gets a 503 at once instead of a timeout later. And have clients back off: wait about 100 ms before the first retry and 200 ms before the second, each times a random factor. Over the same five seconds the servers waste almost nothing (35 requests instead of 1,600), nobody times out, and 29% more requests succeed (827 a second instead of 643), because every CPU millisecond goes to a request someone is still waiting for. By 7.5 s the median is back to 48 ms.
[▶ Short queues and backoff during the same slowdown](play:fail fast: short queues@t=6)
One oddity in that run: p99 sits near 400 ms even before the slowdown. Those are heavy clients' requests that got a 429, waited, and got a token on a later try. The limit still holds: retries take tokens like any request.

**4. Plan for the sum of the limits.** A year later the API has 400 clients. Each is well under its limit: normal clients send about 5.6 a second, and the heavy clients are still held to 10. Together they send 2,280 a second past the limit, more than the 2,000 three servers can finish. The limit does nothing about it, because no single client is over. The servers are 100% busy, 9% of requests get a 503, and the median is back to 263 ms.
[▶ Broken: 400 clients, each within its limit, fill the servers](play:broken: twice the clients@t=5)
A per-client limit bounds one client, not the total. The most it can ever let through is clients × rate: 400 × 10 = 4,000 a second. Five servers (3,333 a second) carry today's 2,280 at 69% busy with p99 at 59 ms, for $0.88 an hour instead of $0.54.
[▶ Five servers for 400 clients](play:sized fleet@t=5)
To survive every client using its whole allowance at once you would need 4,000 × 6 ms ≈ 24 cores of work, about 9 servers at 70% busy. Most APIs do not buy that; they watch the total, add servers as it grows, and keep a global limit (below) as the last line.

## Why it works now

Each problem had its own fix. The token bucket gives each client its fair share and turns the rest away for almost nothing, so a few heavy clients cannot take the servers from everyone else. A burst of 20 keeps that limit from punishing normal clients for random clumps. Short queues and backoff make sure that when capacity drops, the servers spend it only on requests someone is still waiting for. And sizing the fleet for the total that passes the limits, not for the average client, keeps the servers out of the red as the API grows.

## What it costs

- Every request now passes a limiter check. On one load balancer that is a counter in memory; across many it is a network round trip (see Staff notes).
- Some legitimate bursts will get 429s, whatever burst you choose. Clients must handle 429 gracefully, and you must document the limits.
- Short queues mean more 503s during a slowdown, in exchange for no wasted work and a faster recovery.
- Backoff makes a retried request slower for that client.
- Capacity planned for the sum of the limits is expensive; capacity planned for today's total needs monitoring and a global limit.

## Staff notes

- **Where the counters live.** In this simulation the limit is a token bucket per key inside one load balancer. That is exact, and it only works because there is one load balancer. A real public API has many gateways, and a client's requests are spread over them. Three common answers: (a) keep the counters in a shared store such as Redis, at the cost of a network round trip on every request and a new dependency. That is exact across gateways only if checking and taking a token is one **atomic** step (Redis INCR, or a small Lua script that Redis runs without interruption). If a gateway reads the count and then writes it back, two gateways can both read "1 left" and both let a request through; (b) give each of N gateways a local bucket with limit / N, which needs no coordination but is unfair when a client's traffic is uneven across gateways; (c) count locally and sync to a shared store every few hundred milliseconds, accepting a small overshoot.
- **When the shared store is down.** Decide in advance whether the limiter fails open (let everything through and protect the servers some other way) or closed (reject everything). Most public APIs fail open.
- **Which algorithm.** A token bucket allows bursts and is cheap to store (two numbers per key). A fixed window is simpler but lets a client send twice the limit across a window boundary; a sliding window fixes that at more memory or some approximation. See primitives 012, "Token Bucket and Leaky Bucket", and 013, "Window Rate Limiters".
- **Layers of limits.** Per key, per IP for unauthenticated traffic, per endpoint (an expensive search can cost 10 tokens), and one global limit that protects the servers from the sum. Paying customers usually get their own, larger buckets.
- **Tell clients what to do.** Return 429 with Retry-After and the remaining allowance in headers. Publish the limits. Ship client libraries that back off with jitter, and that cap retries.
- **Queues and timeouts are one decision.** A queue longer than timeout × service rate only stores future timeouts. Size queues from the timeout, not from "never reject".
- **A rate limit is not a capacity plan.** Watch the total that passes the limiter, and alert on it before it reaches what the servers can do.

## Check yourself

- **Q:** Without any limit, why do the 196 normal clients suffer when only 4 clients misbehave?
  A: Nothing tells the requests apart. The servers are full, so every request, normal or heavy, waits in the same line and is as likely to get a 503. [▶ Show it](play:broken: no limits@t=6)
- **Q:** The steady rate is 10 a second and a normal client sends 5. Why does a bucket of 1 token still reject a third of its requests?
  A: Requests arrive in random clumps. Two within 100 ms of each other find the bucket empty, even though the average is half the rate. [▶ Show it](play:broken: no burst@t=6)
- **Q:** During a slowdown, someone raises each server's queue from 100 to 400 to cut the 503s. What happens?
  A: Requests wait past the 1-second timeout. The servers spend their reduced capacity on work nobody is waiting for, fewer requests succeed, and the line takes longer to clear afterwards. [▶ Show it](play:broken: deep queues — requests@t=6)
- **Q:** Every client is within its limit, yet the servers are full. What went wrong?
  A: The limit caps each client, not the total. 400 clients at their normal rates add up to more than three servers can do; the fleet must grow with the total. [▶ Show it](play:broken: twice the clients@t=5)

## Deep dive

Why does a bucket of 1 token reject about a third of a normal client's requests? Follow the bucket from one accepted request to the next. An accepted request takes the only token, so the bucket is empty for the next 100 ms (1 / rate, at 10 tokens a second). The client sends 5 requests a second at random moments, so on average 5 × 0.1 = 0.5 requests land in that 100 ms window, and each is rejected. Rejected requests take no token, so they do not restart the window. After the window, the token is back, and the next request, whenever it comes, is accepted and starts the cycle again. Random arrivals have no memory (how long you have already waited says nothing about how long the next gap will be), so every cycle looks the same: 1 accepted request and on average 0.5 rejected. That is 0.5 / 1.5 = 1/3 of a normal client's requests rejected, which is what the run shows. With room for 20 tokens, a client would need about 20 more requests than its steady allowance inside a short stretch, which at 5 a second essentially never happens.
