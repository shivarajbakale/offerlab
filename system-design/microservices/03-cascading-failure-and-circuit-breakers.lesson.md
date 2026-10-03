# Cascading failure and circuit breakers

## What it is

- **What it is:** A cascading failure is one slow part of a system dragging down parts that were healthy. A circuit breaker is a switch in the caller that stops calling a dependency that keeps failing, and fails those calls at once instead of waiting.
- **The problem it solves:** One slow service can tie up every worker in the servers that call it, so requests that never touch it fail too. A timeout, a circuit breaker and a fallback cap how long and how often callers wait, and let the page load without the broken part.
- **Reach for it when:** A request calls a service you do not control or that has had slow spells, the page can live without that service's answer, and many requests a second share one pool of workers.
- **Not the right tool when:** The dependency is required and has no fallback: a breaker can only fail those requests fast and clearly, which frees workers but does not save the page. To keep endpoints apart however the breaker is tuned, cap each dependency's share of workers with a [bulkhead](#/sd-microservices/05-bulkheads). The state machine alone is in [circuit breaker](#/sd-04-traffic/016-circuit-breaker).
- **Where you'll meet it:** Michael Nygard's book "Release It!", which made the circuit breaker pattern widely known; Netflix's Hystrix library (now in maintenance mode) and Resilience4j; Envoy's circuit breaking settings; outage questions in senior interviews ("one service got slow and everything went down").

## Words we'll use

- **Endpoint** — one kind of request a server answers, like "show a product page" or "check out".
- **Dependency** — another service a server calls to answer a request. Here product pages depend on Reviews; checkout does not.
- **Worker** — a slot for one request in progress inside a server. It stays taken while the request waits for anything, including a dependency's answer. Every endpoint on a server shares the same workers. Here there are 4 servers × 50 workers = 200.
- **Cascading failure** — a failure in one part that spreads to parts that did not fail themselves: here, a slow Reviews service making checkout fail.
- **Timeout** — how long a caller waits for a call's answer before giving up on it. Giving up frees the worker; the callee is not told and carries on (unless the protocol propagates deadlines, as gRPC does).
- **Circuit breaker** — a switch in the caller, one per dependency. **Closed**: calls go through, and it counts how many fail. **Open**: once too many have failed recently, calls fail at once without being sent, for a set time. **Half-open**: then it lets a few trial calls through; if they work it closes, if not it opens again.
- **Short-circuited** — a call an open breaker failed at once, without sending it.
- **Fallback** — what the caller does instead when a call fails: here, show the page without reviews. A page answered that way is **degraded**.
- **Little's law** — the number of requests in progress equals the rate they arrive times how long each one stays. 900 calls a second that each take 1 s need 900 workers.

## The world we're in

- 1,000 requests a second: 900 product pages and 100 checkouts.
- A product page reads the product from the database, then calls Reviews and shows its answer. A checkout writes the order to the database. It never calls Reviews.
- Reviews is another team's service. It normally answers in about 5 ms. From 5 s to 15 s it answers in about 1 s instead: a bad deploy, a lock in its database. It is slow, not down.
- On a normal day workers are about 7% busy.

## The goal

When Reviews is slow, checkout must keep working, product pages should still load, and we should not keep piling calls onto a service that is struggling.

## The naive attempt

"Call Reviews and wait for the answer. It is usually 5 ms."

From 5 s, each product page holds its worker for about 1 s while it waits for Reviews. By Little's law, 900 pages a second × 1 s needs 900 workers. There are 200. In a fraction of a second every worker is waiting on Reviews, the queues fill, and new requests are turned away. From 6 s to 15 s, 99% of checkouts fail, though checkout never calls Reviews: it simply cannot get a worker. The app servers' CPUs are 6% busy. Nothing is broken on them; they are all waiting.
[▶ Broken: slow Reviews takes checkout down too](play:broken: wait as long as it takes@t=8)
When Reviews recovers at 15 s, everything recovers with it.
[▶ Recovery at 15 s](play:broken: wait as long as it takes@t=17)

## Building it up

**1. Put a timeout on the call.** The damage is call rate × wait. We cannot change the rate, but we can cap the wait. Give up on Reviews after 150 ms. Now 900 × 0.15 s = 135 workers are waiting at most, of 200, and the rest are free. Checkout works again: no errors, p99 about 21 ms, the same as on a normal day. But every product page fails, all 900 a second, because we treat a failed Reviews call as a failed page. About 71% of workers are still tied up waiting for answers that will not come in time.
[▶ Timeout: checkout survives, every product page fails](play:timeout: checkout survives@t=8)

**2. See that a timeout is a budget, not a guess.** The same design with a 300 ms timeout: 900 × 0.3 s = 270 workers needed, and there are 200. Every worker is busy again, checkouts wait their turn (median about 560 ms) and about 27% of them fail. A timeout must be short enough that call rate × timeout fits well inside the pool, not just "longer than a normal answer". Slide "reviews timeout (ms)" on stage 2 to find the cliff.
[▶ Broken: a 300 ms timeout is already too long](play:broken: a 300 ms timeout@t=8)

**3. Stop calling a dependency that keeps failing.** Each timeout still costs a worker 150 ms and sends Reviews another call it cannot answer. A circuit breaker watches the outcomes: once half of at least 20 calls in the last 2 s failed or timed out, it opens. While open, every call to Reviews fails at once, with no network call and no wait. After 2 s it lets 5 trial calls through to see whether Reviews is back.

**4. Give the page something to show.** A failed Reviews call should not fail the page: the product, its price and the Buy button do not depend on reviews. So any failure, including an open breaker, skips Reviews and renders the page without them. With both, from 6 s to 15 s nothing fails. About 90% of all answers are degraded (every product page, shown without reviews), the median page takes about 11 ms, and workers are about 6% busy. Reviews gets about 17 calls a second, the trial calls and their timeouts, instead of 900.
[▶ Breaker: pages without reviews, nothing fails](play:breaker: pages without reviews@t=8)

**5. Let it close by itself.** When Reviews recovers at 15 s, the next trial calls succeed and each breaker closes. From 17 s every page has its reviews again.
[▶ The breakers close after Reviews recovers](play:breaker: pages without reviews@t=17)

## Why it works now

The failure spread through the one thing every endpoint shares: workers. A slow dependency held them at the rate of its calls times its latency.
[▶ Broken: every worker waiting on Reviews](play:broken: wait as long as it takes@t=8)
The timeout capped the latency, the breaker cut the rate of calls that could tie up a worker to a handful, and the fallback turned the remaining failures into pages with a little less on them.
[▶ Workers free, pages fast](play:breaker: pages without reviews@t=10)

## What it costs

- **Some good calls fail.** While a breaker is open it fails every call, even ones that would have worked. If Reviews is slow for only some requests, the breaker may open and drop reviews for everyone for 2 s at a time.
- **A fallback must exist.** "No reviews" is a fine page. "No price" or "no stock check" is not: some dependencies have no safe fallback, and for those the best you can do is fail fast and clearly.
- **Tuning.** Window, threshold, open time and trial calls all matter. A breaker per caller replica (as here) sees only its own calls; with few calls per replica it may need a lower threshold or a longer window. A long window counts the healthy calls from before the outage, so it opens late.
- **Hidden outages.** A degraded page looks fine to the user and to a dashboard that counts errors. Count degraded answers and alert on open breakers.

## Staff notes

- Every outbound call needs a timeout. Library and client defaults are often far too long for an online request (sometimes 30 s or none at all); set them on purpose.
- Size the timeout from both sides: above the dependency's normal p99.9, and small enough that peak call rate × timeout fits well inside the worker pool.
- Decide the fallback per dependency with the product owner, before the outage: cached data, a default, hide the widget, or fail the request.
- Circuit breakers protect the caller and give the callee room to recover. They do not keep endpoints apart: if many dependencies are slow at once, or the breaker is tuned too loosely, a separate worker pool per dependency (a bulkhead, lesson 05) is the backstop.
- Primitive 016 (Circuit Breaker) builds the closed, open and half-open state machine step by step.

## Check yourself

- **Q:** Checkout never calls Reviews. Why did it fail when Reviews got slow?
  A: Product pages held every shared worker while waiting for Reviews (900 a second × 1 s is far more than 200 workers), so checkouts could not get one. [▶ Show it](play:broken: wait as long as it takes@t=8)
- **Q:** With a 150 ms timeout checkout works, but with 300 ms it fails again. Why?
  A: Workers held = call rate × timeout: 900 × 0.15 s = 135 fits in 200; 900 × 0.3 s = 270 does not. [▶ Show it](play:broken: a 300 ms timeout@t=8)
- **Q:** With a timeout, product pages still all failed. What fixed them?
  A: A fallback: when the Reviews call fails or is short-circuited, the page is shown without reviews instead of failing. [▶ Show it](play:breaker: pages without reviews@t=8)
- **Q:** What does the breaker add on top of the timeout and fallback?
  A: It stops sending calls: about 17 a second reach Reviews instead of 900, pages do not wait 150 ms first, and workers stay free. [▶ Show it](play:breaker: pages without reviews@t=10)

## Deep dive

Why does a slow dependency do more harm than a crashed one? If the process has crashed but its machine is up, connections are refused at once and the caller fails in about a millisecond, holding a worker for that millisecond, and can use its fallback right away. If the machine itself is gone or unreachable, nothing answers at all, and the caller waits for its connect or request timeout, just as it would for a slow service. Either way, the slow case is the dangerous one, and only a timeout bounds it: each call holds a worker until it answers or times out. By Little's law, the harm grows with latency. That is also why a breaker should count timeouts as failures, and why a timeout should be measured from the caller's side: from the moment it sends to the moment it gives up, whatever the callee is doing.
