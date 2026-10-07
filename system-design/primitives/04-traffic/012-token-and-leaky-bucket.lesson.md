# Token bucket and leaky bucket

## What it is

- **What it is:** A rate limiter that gives each client a bucket of permission slips called tokens. Each request spends one, tokens come back at a fixed rate, and a request that finds the bucket empty is turned away. The leaky bucket variant instead queues requests and lets them out at a steady pace.
- **The problem it solves:** One client's bug, retry loop or script can send thousands of requests a second and slow the server down for everyone. A token bucket caps each client's long-run rate while still letting through the short bursts that normal clients make.
- **Reach for it when:** An API needs a limit per user, per API key or per IP address, with separate settings for the average rate and the biggest burst. Use the leaky bucket when a fragile backend, such as a database, needs requests spread out evenly.
- **Not the right tool when:** The limit is a quota stated as "N requests per period"; [window rate limiters](#/sd-04-traffic/013-window-rate-limiters) count that directly. If the trouble is a failing dependency rather than a greedy client, a [circuit breaker](#/sd-04-traffic/016-circuit-breaker) is the tool.
- **Where you'll meet it:** NGINX's `limit_req` module is a leaky bucket that behaves like a token bucket with `burst` and `nodelay`. AWS API Gateway documents its throttling as a token bucket with rate and burst settings. Both buckets come from network traffic shaping. "Design a rate limiter" is a classic interview question.

## In plain words

A server is a computer that does work for others: it answers requests. It can only do so much per second, and many clients share it. If one client sends far too much, because of a bug, a retry loop or a greedy script, everyone else's requests slow down. A rate limiter gives each client a fair allowance, while still letting through the short bursts that normal clients make, like a web page loading ten pictures at once.

Think of an arcade that hands you tokens. Every game costs one token. You get a new token every few seconds, but your cup holds only five, so you can play five games in a row after a break, and then you have to wait for tokens to trickle in. That is a token bucket. A leaky bucket is a queue at a ticket gate that lets one person through every few seconds, however many arrive at once.

In the picture on the right, the client is on the left, the bucket is in the middle and the server is on the right. For the token bucket, the meter shows the tokens in the bucket against its capacity; for the leaky bucket, it shows the requests waiting in line. The arrows and the line under them show what happened to the latest request: let through to the server, waiting in line, or turned away. Below, the timeline shows every request over time with the bucket's level. The box at the top says what just happened and why.

## Words we'll use

- **Request** — one message from a client asking the server to do some work, such as "load my profile".
- **Client** — a program sending requests. Here, one client and its requests.
- **Rate limit** — a rule like "at most 2 requests per second from each client". A request over the limit is **rejected**: turned away without doing the work.
- **Rate** — how many requests per second a client may send on average, over a long time.
- **Burst** — many requests arriving at about the same moment, for example when a page loads ten pictures at once.
- **Token** — a permission slip for one request. A request that gets a token is let through, and the token is used up.
- **Bucket** — a counter of saved-up tokens, with a top limit called its **capacity**.
- **Refill** — adding tokens to the bucket as time passes, `rate` tokens per second.
- **Queue** — a waiting line. Requests join at the back and leave from the front.

## The world we're in

- Many clients share one server. The server can only do so much work per second, and when it is overloaded every client suffers, not only the one sending too much.
- Clients are not all well behaved. A bug, a retry loop or a greedy script can send thousands of requests a second.
- Normal clients are bursty: quiet for a while, then a handful of requests at once.
- Time is just a number here. Every call says what time it is (`allow(t)`, in seconds), so the runs are repeatable.

## The goal

Let each client average no more than `rate` requests per second, while still letting a short burst of up to `capacity` requests through at once.

## The naive attempt

"A client may send `rate` requests per second. So give it an allowance that grows by `rate` every second, and take one from it per request."

That sounds like a rate limit, but the allowance has no ceiling. A client that stays quiet saves up allowance without end. Here the rate is 1 per second. After a minute of silence the allowance has grown to 64.
[▶ Broken: after 60 quiet seconds the allowance jumps from 4 to 64](play:broken: refill without a cap@at=uncapped#2)
Then 40 requests arrive at the same instant, and every one of them gets through. When the 40th takes its token, 24 are still left. The server meant to see about 1 request per second gets 40 at once.
[▶ Broken: the 40th request of the burst still passes](play:broken: refill without a cap@at=take#41)

## Building it up

**1. Tokens in a bucket, with a capacity.** Instead of an endless allowance, keep tokens in a bucket that holds at most `capacity`. Each request takes one token. When the bucket is empty, requests are rejected. The bucket starts full, so a quiet client can send a burst right away. Here the capacity is 5, the rate is 1 token per second, and eight requests arrive at t=0. The first five each take a token.
[▶ The fifth request takes the last token](play:burst@at=take#5)
The sixth finds the bucket empty and is rejected, and so are the seventh and eighth.
[▶ The sixth request finds 0 tokens and is rejected](play:burst@at=reject#1)

**2. Refill at the rate.** Tokens come back at `rate` per second. One second after the burst, the bucket has earned exactly one token, so one more request gets through. Half a second later there is only half a token, and a request needs a whole one.
[▶ At t=1 the bucket earns 1 token](play:burst@at=refill#9)
[▶ At t=1.5 there is only half a token, so the request is rejected](play:burst@at=reject#4)
So **capacity** decides the biggest burst, and **rate** decides the long-run average. They are separate knobs.

**3. Refill lazily, when a request arrives.** A server may hold millions of buckets, one per client. Running a timer for each one to add tokens would be far too much work. Instead, each bucket remembers `last`, the time it was last topped up. When a request arrives, the bucket works out how long it has been and adds `(t - last) * rate` tokens in one go. A quiet bucket costs nothing at all.
[▶ At t=1.2 the bucket adds 0.6 s × 2 = 1.2 tokens, then caps them at 5](play:steady@at=refill#2)
With requests arriving slower than the rate, the bucket never runs dry, and every request passes.
[▶ The tenth request at t=6 finds the bucket full again](play:steady@at=take#10)

**4. The cap is what stops the huge burst.** Refill uses `Math.min(capacity, …)`. After an 18-second wait the bucket has earned 18 tokens, but it can hold only 5.
[▶ At t=20, 18 seconds have earned 18 tokens; the cap keeps 5](play:refill@at=refill#7)
Seven requests then arrive at once. Five pass and the sixth is rejected: the burst is limited to the capacity, however long the client was quiet.
[▶ The sixth request at t=20 is rejected](play:refill@at=reject#1)

**5. A leaky bucket for smooth output.** A token bucket lets a burst through at once. Some servers can't take that: a database, say, that needs requests spread out. A leaky bucket puts each request in a queue with room for `capacity` requests, and lets them out at a fixed pace, like water dripping from a hole in a bucket. Here the queue has room for 4 and lets out 2 per second, one every 0.5 seconds. Six requests arrive at t=0. The first leaves at once, four wait, and the sixth finds the queue full.
[▶ The sixth request finds the queue full](play:leaky@at=full#1)
Requests then leave at t=0.5, 1, 1.5 and 2, evenly spaced, though they all arrived together. A second burst at t=2.2 has to wait for its turn: its first request goes out at 2.5, 0.5 s after the one before.
[▶ The next request leaves at t=2.5, not 2.2](play:leaky@at=release#6)

## Why it works now

- Over any stretch of time T, a client can send at most `capacity + rate × T` requests: what was in the bucket at the start, plus what was earned. So the long-run average is `rate`, and the biggest instant burst is `capacity`.
- The cap keeps that bound true however long the client was idle. Without it, the bound grows with the idle time, which is what the broken run shows [▶ see it break](play:broken: refill without a cap@at=take#41).
- The scenario tests check each claim: every request under the rate passes, exactly `capacity` of a burst passes, the token level never goes above the capacity, and the leaky bucket's output is spaced exactly `1 / rate` apart.

## What it costs

- **Memory per client.** A token bucket is two numbers: tokens and the last refill time. Cheap for one client, but a limit per user, API key or IP address means one bucket per key, and buckets for idle keys must be thrown away eventually.
- **Bursts reach the server.** A token bucket passes up to `capacity` requests at once. If the server can't absorb that, use a smaller capacity or a leaky bucket.
- **Waiting and dropping in the leaky bucket.** Smooth output means requests wait in the queue (up to `capacity / rate` seconds), and a full queue still rejects them.
- **Choosing numbers.** Too low and real users are rejected; too high and the limit doesn't protect anything. Limits are usually tuned from measured traffic.

## Staff notes

- **Limits across many servers.** A client's requests are usually spread over many servers, so one bucket per server doesn't enforce one limit. Two common fixes: keep the bucket in a shared store and update it atomically (for example a script that runs inside the store), which costs a network round trip per request; or give each server a share of the limit (with 4 servers, each allows a quarter), which is fast but too strict when one server gets most of a client's traffic.
- **Tell clients when to come back.** Over HTTP, a rejected request usually gets status 429 (Too Many Requests). A `Retry-After` header saying how long to wait stops well-behaved clients from retrying at once (lesson 015).
- **What to key on.** Per user, per API key, per IP address, per endpoint. Expensive endpoints often get a tighter limit, or cost several tokens per request.
- **Limit at the edge.** Rejecting early, at a gateway or load balancer, saves the server the work of even reading the request.

## Check yourself

- **Q:** Capacity 5, rate 1 per second, a full bucket, and eight requests at the same instant. How many get through?
  A: Five. Each takes one token and the bucket holds five; the sixth finds it empty. [▶ See it](play:burst@at=reject#1)
- **Q:** The same bucket has been idle for 18 seconds. Seven requests arrive at once. How many pass?
  A: Five. 18 seconds earned 18 tokens, but the cap keeps 5. [▶ See it](play:refill@at=reject#1)
- **Q:** Rate 2 per second, and a request every 0.6 seconds. Is any request rejected?
  A: No. That is about 1.7 per second, below the rate, so the bucket refills faster than it empties. [▶ See it](play:steady@at=take#10)
- **Q:** A leaky bucket lets one request out every 0.5 s. The last one left at t=2. Three requests arrive at t=2.2. When does the first of them leave?
  A: At t=2.5. It must wait `gap` after the one before, so output stays evenly spaced. [▶ See it](play:leaky@at=release#6)
- **Q:** Without the cap, a client is quiet for a minute at 1 token per second, then sends 40 requests at once. How many pass?
  A: All 40. The client saved up 64 tokens, so nothing stops the burst. [▶ See it](play:broken: refill without a cap@at=take#41)

## When to use which

- **Token bucket** — when clients are bursty and you want two separate settings: the long-run rate and the biggest burst. Example: a public API allowing 10 requests per second with bursts of 50, so an app can load a screen's data at once.
- **Leaky bucket** — when the server behind the limiter needs requests evenly spaced, and a short wait is better than a rejection. Example: sending jobs to a database or a third-party API that falls over on bursts.
- **[Window rate limiters](#/sd-04-traffic/013-window-rate-limiters)** — when the limit is stated as "N requests per period", such as a quota of 1,000 calls per hour or 5 login attempts per minute. A sliding counter or log counts that directly.
- **[Load balancing](#/sd-04-traffic/014-load-balancing)** — when the problem is total traffic across many servers, not one greedy client. Spreading the load helps all clients; a rate limiter only reins in the one sending too much.
- **[Retry with backoff](#/sd-04-traffic/015-retry-backoff-jitter)** and **[circuit breakers](#/sd-04-traffic/016-circuit-breaker)** — on the client side. A limiter answers 429 "Too Many Requests"; well-behaved clients back off and retry later instead of hammering.
- **In an interview:** for "design a rate limiter", propose a token bucket per user or API key, kept in a shared store such as Redis and updated atomically, answering 429 with a `Retry-After` header. Mention the leaky bucket when the backend needs smooth traffic.

## Deep dive

- The token bucket and leaky bucket come from network traffic shaping, where they limit how fast a sender may put packets on a link. The "leaky bucket as a meter" variant counts instead of queueing, and then behaves like a token bucket.
- NGINX's `limit_req` module is a leaky bucket by default: up to `burst` extra requests wait in line and are let through at the set rate. With `nodelay`, those burst requests are served at once instead, and the burst slots free up at the set rate, which behaves like a token bucket with capacity `burst`.
- To limit across servers with a shared store, the read-refill-take step must happen as one atomic operation. Otherwise two servers can read the same token count and both spend the last token.
