# Rate limiter class

## What it is

- **What it is:** A class an API server calls before each request to ask "has this caller sent too many lately?" It keeps a separate count for every caller and hides the counting rule behind one small interface, so a token bucket or a sliding log can be swapped in without changing the class.
- **The problem it solves:** The rule most people write first, a counter that resets every second, lets twice the limit through around the reset, and hard-coding any one rule means editing the class whenever product wants a different one. A strategy object per caller, made by a factory and given the time by an injected clock, fixes both and makes every rule testable to the millisecond.
- **Reach for it when:** An interview asks for a rate limiter class with pluggable rules, per-user or per-key limits, a retry time for rejected callers, or a way to test time-based logic without sleeping.
- **Not the right tool when:** The limit must hold across many servers: in-process state lets each server grant its own full limit, so the state belongs in a shared store. For the counting rules themselves, see the [token bucket](#/sd-04-traffic/012-token-and-leaky-bucket) and [window limiters](#/sd-04-traffic/013-window-rate-limiters).
- **Where you'll meet it:** "Design a rate limiter" interviews, as a class or as a service. Java libraries such as Bucket4j and Resilience4j keep limiter state per named limiter or per key, with the rule set by configuration; HTTP APIs reject with 429 Too Many Requests, often with a Retry-After header.

## Words we'll use

- **Rate limiter** — code that decides, for each incoming request, whether the caller has sent too many lately. Over the limit, the request is **rejected** (over HTTP: status 429, Too Many Requests).
- **Key** — what a limit is counted per: a user id, an API key, an IP address. Each key has its own count.
- **Strategy** — one interchangeable rule hidden behind a common interface. Here the interface is one method, `tryAcquire(now)`, and the rules are a token bucket and a sliding log.
- **Factory** — a function that makes a new object on request. The limiter calls it the first time it sees a key, to get that key's fresh strategy.
- **Token bucket** — a rule that keeps up to `capacity` tokens, earns them back at a fixed rate, and spends one per request. Allows bursts up to the capacity (primitive 012).
- **Sliding log** — a rule that remembers the time of every allowed request in the last window and allows a new one only if fewer than `limit` remain. Exact (primitive 013).
- **Fixed window** — a rule that counts requests per clock-aligned window (each whole second, say) and resets the count to zero at each boundary.
- **Retry-After** — how long a rejected caller should wait before trying again (here in milliseconds; the HTTP header is whole seconds, so round up). Telling them stops well-behaved clients from retrying at once.
- **Injected clock** — the code asks a `Clock` object for the time instead of the system clock, so a test can set the time by hand.

## The world we're in

- An API server calls `allow(key)` before doing each request's work. The call must be cheap: it runs on every request.
- Many keys. Most are quiet; a few are noisy (a buggy retry loop, a scraper). One noisy key must not use up another key's allowance.
- Product wants to choose the rule per API: bursty interactive clients want a token bucket, strict billing quotas want an exact count.
- One process, one thread here. Many threads and many servers are in the staff notes.
- Time is in milliseconds from `clock.now()`. Every scenario uses a `FakeClock`.

## The goal

A `RateLimiter` class with one method, `allow(key)`, that answers allowed or not, how many are left, and when to retry. Limits are per key. The rule is pluggable: adding a new one means writing one class, not editing `RateLimiter`. Every rule is testable to the millisecond without sleeping.

## The naive attempt

"Limit 5 per second: count requests in the current second, reset the count when the second changes." That is a fixed window, and it is the first thing most people write. It is cheap: one counter per key.

It fails at the boundary. A caller sends 5 requests at 900 ms, the last moment of the first second; all 5 pass.
[▶ Broken: the fifth request at 900 ms fills the window](play:broken: fixed window@at=counted#5)
At 1,000 ms a new window begins and the count goes back to zero, forgetting requests made 100 ms ago.
[▶ Broken: the counter resets at 1,000 ms](play:broken: fixed window@at=reset#2)
Five more pass. Ten requests in 100 ms, under a limit of "5 per second".
[▶ Broken: the tenth request in 100 ms is allowed](play:broken: fixed window@at=counted#10)
The same traffic through a sliding log or a token bucket lets 5 through. The fix is a better rule, and that is why the rule should be swappable.

## Building it up

**1. One interface for every rule.** A rule is anything with `tryAcquire(nowMs): Decision`, where `Decision` is `{ allowed, remaining, retryAfterMs }`. The rule is given the time; it never reads a clock itself. That one choice makes every rule a pure piece of logic you can test by passing numbers.

**2. A map of keys to rule objects, filled by a factory.** `RateLimiter` holds `Map<key, Strategy>`. The first time a key appears it calls the factory it was given, `make()`, and stores the new object. It never names `TokenBucket` or `SlidingLog`; the caller chooses: `new RateLimiter(() => new TokenBucket(5, 2), clock)`.
[▶ First request from alice: a fresh bucket is made for her](play:token bucket@at=newKey#1)

**3. Token bucket behind the interface.** Capacity 5, refilled at 2 per second. Five requests at once take the five tokens; the sixth finds none.
[▶ The fifth request takes the last token](play:token bucket@at=take#5)
[▶ The sixth gets a 429](play:token bucket@at=empty#1)

**4. An honest Retry-After.** At 200 ms the bucket has earned 0.4 of a token. A whole token needs 0.6 more, which at 2 per second is 300 ms. So the answer is "retry after 300 ms", and a request at 500 ms does pass.
[▶ At 200 ms: rejected, retry after 300 ms](play:token bucket@at=empty#2)
[▶ At 500 ms: allowed, as promised](play:token bucket@at=take#6)

**5. Per key means separate state.** alice sends 5 requests to a 3-token bucket; the fourth and fifth are rejected. Then bob sends one: the factory makes him his own full bucket, and he passes.
[▶ alice's fourth request is rejected](play:per key@at=empty#1)
[▶ bob gets his own bucket and passes](play:per key@at=newKey#2)

**6. Swap the rule, keep the class.** The same `RateLimiter` with `() => new SlidingLog(3, 1000)`: at most 3 requests in *any* 1,000 ms. Requests at 0, 400 and 800 ms pass. At 900 ms the log is full; the oldest entry, from 0 ms, leaves the window at 1,000, so the answer is "retry after 100 ms".
[▶ At 900 ms: full, retry after 100 ms](play:sliding log@at=full#1)
At 1,000 ms the entry from 0 is forgotten and the request passes. At 1,100 ms the log holds 400, 800 and 1,000; the next to leave is 400, at 1,400, so "retry after 300 ms".
[▶ At 1,000 ms the request from 0 ms leaves the log](play:sliding log@at=forget#1)
[▶ At 1,100 ms: retry after 300 ms](play:sliding log@at=full#2)
Nothing in `RateLimiter` changed. That is the strategy pattern doing its job.

## Why it works now

- `RateLimiter` depends only on the `Strategy` interface, so a new rule (a sliding counter, a leaky bucket, a cost-per-request bucket) is one new class plus a different factory. Open for extension, closed for modification.
- Each key has its own strategy object, so one key's requests cannot change another key's decision: bob passed while alice was throttled.
- Every rule is given `now`, so tests set exact times and assert exact decisions, down to `retryAfterMs: 300`.
- The sliding log bounds requests in *any* 1,000 ms window to the limit. The token bucket bounds them to its capacity plus what it refills in that time (5 + 0.5 over these 100 ms), so the boundary burst that let 10 through the fixed window lets 5 through both. Over a full second a 5-token, 5-per-second bucket can still pass 10 (5 at 0 ms, 5 more at 1,000 ms): size capacity for the burst you accept.
  [▶ See the fixed window break](play:broken: fixed window@at=counted#10)

## What it costs

- **Memory per key, forever.** The map keeps a strategy for every key ever seen. A real limiter removes keys idle longer than their window (an LRU of limiters, or a periodic sweep), since a bucket that has refilled to full or a log that has emptied is the same as a new one.
- **Sliding log memory.** One timestamp per allowed request in the window, per key: a limit of 10,000 per hour means up to 10,000 numbers for one key. A sliding counter (primitive 013) approximates it with two counters.
- **One process only.** This state lives in one server's memory. With N servers behind a load balancer, each enforces its own copy of the limit, so a key can get up to N times the limit.
- **An object per key.** Simpler to read than one shared table, but more allocation. At very high key counts, a struct-of-arrays or a shared store is leaner.

## Staff notes

- **Extensibility is the main question.** Expect "now add per-endpoint limits" (key = user + endpoint), "expensive calls cost 5 tokens" (add a `cost` argument to `tryAcquire`), "premium users get a bigger bucket" (the factory takes the key and picks parameters). A good interface absorbs all three without touching the limiter's core.
- **Concurrency.** Two threads calling `allow("alice")` at once can both read 1 token and both take it. Either lock per key (striped locks keyed by hash, so a hot key does not block others), or keep the state immutable and swap it with an atomic compare-and-set, retrying on conflict. Creating the strategy for a new key must also be atomic (a compute-if-absent), or two threads make two buckets.
- **Distributed.** Put the state in a shared store and do read-refill-take as one atomic operation there (for example a script that runs inside the store), at the cost of a network round trip per request. Or give each server a share of the limit: fast, but uneven when traffic is uneven.
- **Fail open or closed.** If the shared store is down, do you allow everything (protects availability) or reject everything (protects the backend)? Decide per API and say it.
- **Testing.** Inject the clock; test each strategy alone with numbers; test the limiter with a fake strategy that records calls; and test the exact boundary times (the request at 1,000 ms when the oldest is at 0 ms and the window is 1,000 ms).

## Check yourself

- **Q:** A fixed window allows 5 per second. A caller sends 5 at 900 ms and 5 at 1,000 ms. How many pass, and why?
  A: All 10. The count resets to zero at the 1,000 ms boundary, forgetting the 5 sent 100 ms earlier. [▶ Show it](play:broken: fixed window@at=reset#2)
- **Q:** A token bucket holds 5, refills 2 per second, and is empty at 0 ms. A request at 200 ms is rejected. What Retry-After should it get?
  A: 300 ms. It has earned 0.4 tokens and needs 0.6 more, which takes 300 ms at 2 per second. [▶ Show it](play:token bucket@at=empty#2)
- **Q:** alice has used up her bucket. bob sends his first request. Is he rejected?
  A: No. The factory gives each new key its own full bucket, so alice's usage never touches bob's. [▶ Show it](play:per key@at=newKey#2)
- **Q:** Sliding log, 3 per 1,000 ms, requests allowed at 0, 400 and 800. When can a request at 900 ms retry?
  A: After 100 ms: the entry from 0 ms leaves the window at 1,000. [▶ Show it](play:sliding log@at=full#1)
- **Q:** What had to change in `RateLimiter` to switch from a token bucket to a sliding log?
  A: Nothing; only the factory passed to its constructor. It talks to the `Strategy` interface, never to a concrete rule. [▶ Show it](play:sliding log@at=forget#1)
